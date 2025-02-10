/* eslint-disable max-lines */
import type * as http from 'node:http';
import type { IncomingMessage, RequestOptions } from 'node:http';
import type * as https from 'node:https';
import type { EventEmitter } from 'node:stream';
import { VERSION } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import type { AggregationCounts, Client, RequestEventData, SanitizedRequestData, Scope } from '@sentry/core';
import {
  addBreadcrumb,
  generateSpanId,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getIsolationScope,
  getSanitizedUrlString,
  httpRequestToRequestData,
  logger,
  parseUrl,
  stripUrlQueryAndFragment,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { getRequestUrl } from '../../utils/getRequestUrl';
import { getRequestInfo } from './vendor/getRequestInfo';

type Http = typeof http;
type Https = typeof https;

type SentryHttpInstrumentationOptions = InstrumentationConfig & {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * For the scope of this instrumentation, this callback only controls breadcrumb creation.
   * The same option can be passed to the top-level httpIntegration where it controls both, breadcrumb and
   * span creation.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for incoming requests to track the health and crash-free rate of your releases in Sentry.
   * Read more about Release Health: https://docs.sentry.io/product/releases/health/
   *
   * Defaults to `true`.
   */
  trackIncomingRequestsAsSessions?: boolean;

  /**
   * Number of milliseconds until sessions tracked with `trackIncomingRequestsAsSessions` will be flushed as a session aggregate.
   *
   * Defaults to `60000` (60s).
   */
  sessionFlushingDelayMS?: number;
};

// We only want to capture request bodies up to 1mb.
const MAX_BODY_BYTE_LENGTH = 1024 * 1024;

/**
 * This custom HTTP instrumentation is used to isolate incoming requests and annotate them with additional information.
 * It does not emit any spans.
 *
 * The reason this is isolated from the OpenTelemetry instrumentation is that users may overwrite this,
 * which would lead to Sentry not working as expected.
 *
 * Important note: Contrary to other OTEL instrumentation, this one cannot be unwrapped.
 * It only does minimal things though and does not emit any spans.
 *
 * This is heavily inspired & adapted from:
 * https://github.com/open-telemetry/opentelemetry-js/blob/f8ab5592ddea5cba0a3b33bf8d74f27872c0367f/experimental/packages/opentelemetry-instrumentation-http/src/http.ts
 */
export class SentryHttpInstrumentation extends InstrumentationBase<SentryHttpInstrumentationOptions> {
  public constructor(config: SentryHttpInstrumentationOptions = {}) {
    super('@sentry/instrumentation-http', VERSION, config);
  }

  /** @inheritdoc */
  public init(): [InstrumentationNodeModuleDefinition, InstrumentationNodeModuleDefinition] {
    return [this._getHttpsInstrumentation(), this._getHttpInstrumentation()];
  }

  /** Get the instrumentation for the http module. */
  private _getHttpInstrumentation(): InstrumentationNodeModuleDefinition {
    return new InstrumentationNodeModuleDefinition(
      'http',
      ['*'],
      (moduleExports: Http): Http => {
        // Patch incoming requests for request isolation
        stealthWrap(moduleExports.Server.prototype, 'emit', this._getPatchIncomingRequestFunction());

        // Patch outgoing requests for breadcrumbs
        const patchedRequest = stealthWrap(moduleExports, 'request', this._getPatchOutgoingRequestFunction());
        stealthWrap(moduleExports, 'get', this._getPatchOutgoingGetFunction(patchedRequest));

        return moduleExports;
      },
      () => {
        // no unwrap here
      },
    );
  }

  /** Get the instrumentation for the https module. */
  private _getHttpsInstrumentation(): InstrumentationNodeModuleDefinition {
    return new InstrumentationNodeModuleDefinition(
      'https',
      ['*'],
      (moduleExports: Https): Https => {
        // Patch incoming requests for request isolation
        stealthWrap(moduleExports.Server.prototype, 'emit', this._getPatchIncomingRequestFunction());

        // Patch outgoing requests for breadcrumbs
        const patchedRequest = stealthWrap(moduleExports, 'request', this._getPatchOutgoingRequestFunction());
        stealthWrap(moduleExports, 'get', this._getPatchOutgoingGetFunction(patchedRequest));

        return moduleExports;
      },
      () => {
        // no unwrap here
      },
    );
  }

  /**
   * Patch the incoming request function for request isolation.
   */
  private _getPatchIncomingRequestFunction(): (
    original: (event: string, ...args: unknown[]) => boolean,
  ) => (this: unknown, event: string, ...args: unknown[]) => boolean {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return (
      original: (event: string, ...args: unknown[]) => boolean,
    ): ((this: unknown, event: string, ...args: unknown[]) => boolean) => {
      return function incomingRequest(this: unknown, event: string, ...args: unknown[]): boolean {
        // Only traces request events
        if (event !== 'request') {
          return original.apply(this, [event, ...args]);
        }

        instrumentation._diag.debug('http instrumentation for incoming request');

        const isolationScope = getIsolationScope().clone();
        const request = args[0] as http.IncomingMessage;
        const response = args[1] as http.OutgoingMessage;

        const normalizedRequest = httpRequestToRequestData(request);

        // request.ip is non-standard but some frameworks set this
        const ipAddress = (request as { ip?: string }).ip || request.socket?.remoteAddress;

        patchRequestToCaptureBody(request, isolationScope);

        // Update the isolation scope, isolate this request
        isolationScope.setSDKProcessingMetadata({ normalizedRequest, ipAddress });

        // attempt to update the scope's `transactionName` based on the request URL
        // Ideally, framework instrumentations coming after the HttpInstrumentation
        // update the transactionName once we get a parameterized route.
        const httpMethod = (request.method || 'GET').toUpperCase();
        const httpTarget = stripUrlQueryAndFragment(request.url || '/');

        const bestEffortTransactionName = `${httpMethod} ${httpTarget}`;

        isolationScope.setTransactionName(bestEffortTransactionName);

        if (instrumentation.getConfig().trackIncomingRequestsAsSessions !== false) {
          recordRequestSession({
            requestIsolationScope: isolationScope,
            response,
            sessionFlushingDelayMS: instrumentation.getConfig().sessionFlushingDelayMS ?? 60_000,
          });
        }

        return withIsolationScope(isolationScope, () => {
          return withScope(scope => {
            // Set a new propagationSpanId for this request
            scope.getPropagationContext().propagationSpanId = generateSpanId();
            return original.apply(this, [event, ...args]);
          });
        });
      };
    };
  }

  /**
   * Patch the outgoing request function for breadcrumbs.
   */
  private _getPatchOutgoingRequestFunction(): (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    original: (...args: any[]) => http.ClientRequest,
  ) => (options: URL | http.RequestOptions | string, ...args: unknown[]) => http.ClientRequest {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return (original: (...args: unknown[]) => http.ClientRequest): ((...args: unknown[]) => http.ClientRequest) => {
      return function outgoingRequest(this: unknown, ...args: unknown[]): http.ClientRequest {
        instrumentation._diag.debug('http instrumentation for outgoing requests');

        // Making a copy to avoid mutating the original args array
        // We need to access and reconstruct the request options object passed to `ignoreOutgoingRequests`
        // so that it matches what Otel instrumentation passes to `ignoreOutgoingRequestHook`.
        // @see https://github.com/open-telemetry/opentelemetry-js/blob/7293e69c1e55ca62e15d0724d22605e61bd58952/experimental/packages/opentelemetry-instrumentation-http/src/http.ts#L756-L789
        const argsCopy = [...args];

        const options = argsCopy.shift() as URL | http.RequestOptions | string;

        const extraOptions =
          typeof argsCopy[0] === 'object' && (typeof options === 'string' || options instanceof URL)
            ? (argsCopy.shift() as http.RequestOptions)
            : undefined;

        const { optionsParsed } = getRequestInfo(instrumentation._diag, options, extraOptions);

        const request = original.apply(this, args) as ReturnType<typeof http.request>;

        request.prependListener('response', (response: http.IncomingMessage) => {
          const _breadcrumbs = instrumentation.getConfig().breadcrumbs;
          const breadCrumbsEnabled = typeof _breadcrumbs === 'undefined' ? true : _breadcrumbs;

          const _ignoreOutgoingRequests = instrumentation.getConfig().ignoreOutgoingRequests;
          const shouldCreateBreadcrumb =
            typeof _ignoreOutgoingRequests === 'function'
              ? !_ignoreOutgoingRequests(getRequestUrl(request), optionsParsed)
              : true;

          if (breadCrumbsEnabled && shouldCreateBreadcrumb) {
            addRequestBreadcrumb(request, response);
          }
        });

        return request;
      };
    };
  }

  /** Path the outgoing get function for breadcrumbs. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getPatchOutgoingGetFunction(clientRequest: (...args: any[]) => http.ClientRequest) {
    return (_original: unknown): ((...args: unknown[]) => http.ClientRequest) => {
      // Re-implement http.get. This needs to be done (instead of using
      // getPatchOutgoingRequestFunction to patch it) because we need to
      // set the trace context header before the returned http.ClientRequest is
      // ended. The Node.js docs state that the only differences between
      // request and get are that (1) get defaults to the HTTP GET method and
      // (2) the returned request object is ended immediately. The former is
      // already true (at least in supported Node versions up to v10), so we
      // simply follow the latter. Ref:
      // https://nodejs.org/dist/latest/docs/api/http.html#http_http_get_options_callback
      // https://github.com/googleapis/cloud-trace-nodejs/blob/master/src/instrumentations/instrumentation-http.ts#L198
      return function outgoingGetRequest(...args: unknown[]): http.ClientRequest {
        const req = clientRequest(...args);
        req.end();
        return req;
      };
    };
  }
}

/**
 * This is a minimal version of `wrap` from shimmer:
 * https://github.com/othiym23/shimmer/blob/master/index.js
 *
 * In contrast to the original implementation, this version does not allow to unwrap,
 * and does not make it clear that the method is wrapped.
 * This is necessary because we want to wrap the http module with our own code,
 * while still allowing to use the HttpInstrumentation from OTEL.
 *
 * Without this, if we'd just use `wrap` from shimmer, the OTEL instrumentation would remove our wrapping,
 * because it only allows any module to be wrapped a single time.
 */
function stealthWrap<Nodule extends object, FieldName extends keyof Nodule>(
  nodule: Nodule,
  name: FieldName,
  wrapper: (original: Nodule[FieldName]) => Nodule[FieldName],
): Nodule[FieldName] {
  const original = nodule[name];
  const wrapped = wrapper(original);

  defineProperty(nodule, name, wrapped);
  return wrapped;
}

// Sets a property on an object, preserving its enumerability.
function defineProperty<Nodule extends object, FieldName extends keyof Nodule>(
  obj: Nodule,
  name: FieldName,
  value: Nodule[FieldName],
): void {
  const enumerable = !!obj[name] && Object.prototype.propertyIsEnumerable.call(obj, name);

  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: enumerable,
    writable: true,
    value: value,
  });
}

/** Add a breadcrumb for outgoing requests. */
function addRequestBreadcrumb(request: http.ClientRequest, response: http.IncomingMessage): void {
  const data = getBreadcrumbData(request);

  const statusCode = response.statusCode;
  const level = getBreadcrumbLogLevelFromHttpStatusCode(statusCode);

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: statusCode,
        ...data,
      },
      type: 'http',
      level,
    },
    {
      event: 'response',
      request,
      response,
    },
  );
}

function getBreadcrumbData(request: http.ClientRequest): Partial<SanitizedRequestData> {
  try {
    // `request.host` does not contain the port, but the host header does
    const host = request.getHeader('host') || request.host;
    const url = new URL(request.path, `${request.protocol}//${host}`);
    const parsedUrl = parseUrl(url.toString());

    const data: Partial<SanitizedRequestData> = {
      url: getSanitizedUrlString(parsedUrl),
      'http.method': request.method || 'GET',
    };

    if (parsedUrl.search) {
      data['http.query'] = parsedUrl.search;
    }
    if (parsedUrl.hash) {
      data['http.fragment'] = parsedUrl.hash;
    }

    return data;
  } catch {
    return {};
  }
}

/**
 * This method patches the request object to capture the body.
 * Instead of actually consuming the streamed body ourselves, which has potential side effects,
 * we monkey patch `req.on('data')` to intercept the body chunks.
 * This way, we only read the body if the user also consumes the body, ensuring we do not change any behavior in unexpected ways.
 */
function patchRequestToCaptureBody(req: IncomingMessage, isolationScope: Scope): void {
  const chunks: Buffer[] = [];

  function getChunksSize(): number {
    return chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  }

  /**
   * We need to keep track of the original callbacks, in order to be able to remove listeners again.
   * Since `off` depends on having the exact same function reference passed in, we need to be able to map
   * original listeners to our wrapped ones.
   */
  const callbackMap = new WeakMap();

  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.on = new Proxy(req.on, {
      apply: (target, thisArg, args: Parameters<typeof req.on>) => {
        const [event, listener, ...restArgs] = args;

        if (event === 'data') {
          const callback = new Proxy(listener, {
            apply: (target, thisArg, args: Parameters<typeof listener>) => {
              // If we have already read more than the max body length, we stop adding chunks
              // To avoid growing the memory indefinitely if a response is e.g. streamed
              if (getChunksSize() < MAX_BODY_BYTE_LENGTH) {
                const chunk = args[0] as Buffer;
                chunks.push(chunk);
              } else if (DEBUG_BUILD) {
                logger.log(
                  `Dropping request body chunk because it maximum body length of ${MAX_BODY_BYTE_LENGTH}b is exceeded.`,
                );
              }

              return Reflect.apply(target, thisArg, args);
            },
          });

          callbackMap.set(listener, callback);

          return Reflect.apply(target, thisArg, [event, callback, ...restArgs]);
        }

        if (event === 'end') {
          const callback = new Proxy(listener, {
            apply: (target, thisArg, args) => {
              try {
                const body = Buffer.concat(chunks).toString('utf-8');

                if (body) {
                  const normalizedRequest = { data: body } satisfies RequestEventData;
                  isolationScope.setSDKProcessingMetadata({ normalizedRequest });
                }
              } catch {
                // ignore errors here
              }

              return Reflect.apply(target, thisArg, args);
            },
          });

          callbackMap.set(listener, callback);

          return Reflect.apply(target, thisArg, [event, callback, ...restArgs]);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });

    // Ensure we also remove callbacks correctly
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.off = new Proxy(req.off, {
      apply: (target, thisArg, args: Parameters<typeof req.off>) => {
        const [, listener] = args;

        const callback = callbackMap.get(listener);
        if (callback) {
          callbackMap.delete(listener);

          const modifiedArgs = args.slice();
          modifiedArgs[1] = callback;
          return Reflect.apply(target, thisArg, modifiedArgs);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });
  } catch {
    // ignore errors if we can't patch stuff
  }
}

/**
 * Starts a session and tracks it in the context of a given isolation scope.
 * When the passed response is finished, the session is put into a task and is
 * aggregated with other sessions that may happen in a certain time window
 * (sessionFlushingDelayMs).
 *
 * The sessions are always aggregated by the client that is on the current scope
 * at the time of ending the response (if there is one).
 */
// Exported for unit tests
export function recordRequestSession({
  requestIsolationScope,
  response,
  sessionFlushingDelayMS,
}: { requestIsolationScope: Scope; response: EventEmitter; sessionFlushingDelayMS?: number }): void {
  requestIsolationScope.setSDKProcessingMetadata({
    requestSession: { status: 'ok' },
  });
  response.once('close', () => {
    // We need to grab the client off the current scope instead of the isolation scope because the isolation scope doesn't hold any client out of the box.
    const client = getClient();
    const requestSession = requestIsolationScope.getScopeData().sdkProcessingMetadata.requestSession;

    if (client && requestSession) {
      DEBUG_BUILD && logger.debug(`Recorded request session with status: ${requestSession.status}`);

      const roundedDate = new Date();
      roundedDate.setSeconds(0, 0);
      const dateBucketKey = roundedDate.toISOString();

      const existingClientAggregate = clientToRequestSessionAggregatesMap.get(client);
      const bucket = existingClientAggregate?.[dateBucketKey] || { exited: 0, crashed: 0, errored: 0 };
      bucket[({ ok: 'exited', crashed: 'crashed', errored: 'errored' } as const)[requestSession.status]]++;

      if (existingClientAggregate) {
        existingClientAggregate[dateBucketKey] = bucket;
      } else {
        DEBUG_BUILD && logger.debug('Opened new request session aggregate.');
        const newClientAggregate = { [dateBucketKey]: bucket };
        clientToRequestSessionAggregatesMap.set(client, newClientAggregate);

        const flushPendingClientAggregates = (): void => {
          clearTimeout(timeout);
          unregisterClientFlushHook();
          clientToRequestSessionAggregatesMap.delete(client);

          const aggregatePayload: AggregationCounts[] = Object.entries(newClientAggregate).map(
            ([timestamp, value]) => ({
              started: timestamp,
              exited: value.exited,
              errored: value.errored,
              crashed: value.crashed,
            }),
          );
          client.sendSession({ aggregates: aggregatePayload });
        };

        const unregisterClientFlushHook = client.on('flush', () => {
          DEBUG_BUILD && logger.debug('Sending request session aggregate due to client flush');
          flushPendingClientAggregates();
        });
        const timeout = setTimeout(() => {
          DEBUG_BUILD && logger.debug('Sending request session aggregate due to flushing schedule');
          flushPendingClientAggregates();
        }, sessionFlushingDelayMS).unref();
      }
    }
  });
}

const clientToRequestSessionAggregatesMap = new Map<
  Client,
  { [timestampRoundedToSeconds: string]: { exited: number; crashed: number; errored: number } }
>();
