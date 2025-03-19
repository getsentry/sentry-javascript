/* eslint-disable max-lines */
import { context, propagation } from '@opentelemetry/api';
import { VERSION } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import type { AggregationCounts, Client, RequestEventData, SanitizedRequestData, Scope } from '@sentry/core';
import {
  LRUMap,
  addBreadcrumb,
  generateSpanId,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getSanitizedUrlString,
  getTraceData,
  httpRequestToRequestData,
  logger,
  objectToBaggageHeader,
  parseBaggageHeader,
  parseUrl,
  stripUrlQueryAndFragment,
  withIsolationScope,
} from '@sentry/core';
import { shouldPropagateTraceForUrl } from '@sentry/opentelemetry';
import type * as http from 'node:http';
import type { IncomingMessage, RequestOptions } from 'node:http';
import type * as https from 'node:https';
import type { EventEmitter } from 'node:stream';
import { DEBUG_BUILD } from '../../debug-build';
import { getRequestUrl } from '../../utils/getRequestUrl';
import { stealthWrap } from './utils';
import { getRequestInfo } from './vendor/getRequestInfo';

type Http = typeof http;
type Https = typeof https;

type RequestArgs =
  // eslint-disable-next-line @typescript-eslint/ban-types
  | [url: string | URL, options?: RequestOptions, callback?: Function]
  // eslint-disable-next-line @typescript-eslint/ban-types
  | [options: RequestOptions, callback?: Function];

export type SentryHttpInstrumentationOptions = InstrumentationConfig & {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Whether to extract the trace ID from the `sentry-trace` header for incoming requests.
   * By default this is done by the HttpInstrumentation, but if that is not added (e.g. because tracing is disabled, ...)
   * then this instrumentation can take over.
   *
   * @default `false`
   */
  extractIncomingTraceFromHeader?: boolean;

  /**
   * Whether to propagate Sentry trace headers in ougoing requests.
   * By default this is done by the HttpInstrumentation, but if that is not added (e.g. because tracing is disabled, ...)
   * then this instrumentation can take over.
   *
   * @default `false`
   */
  propagateTraceInOutgoingRequests?: boolean;

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
  private _propagationDecisionMap: LRUMap<string, boolean>;

  public constructor(config: SentryHttpInstrumentationOptions = {}) {
    super('@sentry/instrumentation-http', VERSION, config);
    this._propagationDecisionMap = new LRUMap<string, boolean>(100);
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
      return function incomingRequest(this: unknown, ...args: [event: string, ...args: unknown[]]): boolean {
        // Only traces request events
        if (args[0] !== 'request') {
          return original.apply(this, args);
        }

        instrumentation._diag.debug('http instrumentation for incoming request');

        const isolationScope = getIsolationScope().clone();
        const request = args[1] as http.IncomingMessage;
        const response = args[2] as http.OutgoingMessage;

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
          // Set a new propagationSpanId for this request
          // We rely on the fact that `withIsolationScope()` will implicitly also fork the current scope
          // This way we can save an "unnecessary" `withScope()` invocation
          getCurrentScope().getPropagationContext().propagationSpanId = generateSpanId();

          // If we don't want to extract the trace from the header, we can skip this
          if (!instrumentation.getConfig().extractIncomingTraceFromHeader) {
            return original.apply(this, args);
          }

          const ctx = propagation.extract(context.active(), normalizedRequest.headers);
          return context.with(ctx, () => {
            return original.apply(this, args);
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
        const argsCopy = [...args] as RequestArgs;

        const options = argsCopy[0];
        const extraOptions = typeof argsCopy[1] === 'object' ? argsCopy[1] : undefined;

        const { optionsParsed, origin, pathname } = getRequestInfo(instrumentation._diag, options, extraOptions);
        const url = getAbsoluteUrl(origin, pathname);

        // This will be undefined if there are no changed headers
        const mergedHeaders = instrumentation.getConfig().propagateTraceInOutgoingRequests
          ? getMergedHeadersForRequestOptions(url, optionsParsed, instrumentation._propagationDecisionMap)
          : undefined;

          // If we are not proapgating traces, we skip touching the args for the request at all
        const request = mergedHeaders
          ? (original.apply(this, getOutgoingRequestArgsWithHeaders(argsCopy, mergedHeaders)) as ReturnType<
              typeof http.request
            >)
          : (original.apply(this, args) as ReturnType<typeof http.request>);

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
}: {
  requestIsolationScope: Scope;
  response: EventEmitter;
  sessionFlushingDelayMS?: number;
}): void {
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

/**
 * If there are any headers to be added for this request, this will return the full merged headers object.
 * Else, it will return void.
 */
function getMergedHeadersForRequestOptions(
  url: string,
  options: RequestOptions,
  propagationDecisionMap: LRUMap<string, boolean>,
): void | http.OutgoingHttpHeaders {
  // Manually add the trace headers, if it applies
  // Note: We do not use `propagation.inject()` here, because our propagator relies on an active span
  // Which we do not have in this case
  const tracePropagationTargets = getClient()?.getOptions().tracePropagationTargets;
  const addedHeaders = shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)
    ? getTraceData()
    : undefined;

  if (!addedHeaders) {
    return;
  }

  const headers = options.headers || {};

  const { 'sentry-trace': sentryTrace, baggage } = addedHeaders;

  // We do not want to overwrite existing header here, if it was already set
  if (sentryTrace && !headers['sentry-trace']) {
    headers['sentry-trace'] = sentryTrace;
  }

  // For baggage, we make sure to merge this into a possibly existing header
  if (baggage) {
    headers['baggage'] = mergeBaggageHeaders(headers['baggage'], baggage);
  }

  return headers;
}

function getAbsoluteUrl(origin: string, path: string = '/'): string {
  try {
    const url = new URL(path, origin);
    return url.toString();
  } catch {
    // fallback: Construct it on our own
    const url = `${origin}`;

    if (url.endsWith('/') && path.startsWith('/')) {
      return `${url}${path.slice(1)}`;
    }

    if (!url.endsWith('/') && !path.startsWith('/')) {
      return `${url}/${path.slice(1)}`;
    }

    return `${url}${path}`;
  }
}

function mergeBaggageHeaders(
  existing: string | string[] | number | undefined,
  baggage: string,
): string | string[] | number | undefined {
  if (!existing) {
    return baggage;
  }

  const existingBaggageEntries = parseBaggageHeader(existing);
  const newBaggageEntries = parseBaggageHeader(baggage);

  if (!newBaggageEntries) {
    return existing;
  }

  // Existing entries take precedence, ensuring order remains stable for minimal changes
  const mergedBaggageEntries = { ...existingBaggageEntries };
  Object.entries(newBaggageEntries).forEach(([key, value]) => {
    if (!mergedBaggageEntries[key]) {
      mergedBaggageEntries[key] = value;
    }
  });

  return objectToBaggageHeader(mergedBaggageEntries);
}

function getOutgoingRequestArgsWithHeaders(originalArgs: RequestArgs, headers: http.OutgoingHttpHeaders): RequestArgs {
  const argsCopy = [...originalArgs] as RequestArgs;

  const arg1 = argsCopy[0];

  // If the first argument is a string or URL, we need to merge the headers into the options object, which is optional
  if (typeof arg1 === 'string' || arg1 instanceof URL) {
    const arg2 = argsCopy[1];

    // If the second argument is an object, we just overwrite the headers there
    if (typeof arg2 === 'object') {
      argsCopy[1] = {
        ...arg2,
        headers,
      };
      return argsCopy;
    }

    // Else, we need to insert a new object as second argument and insert the headers there
    argsCopy.splice(1, 0, { headers });
    return argsCopy;
  }

  // If the first argument is an object, we just overwrite the headers there
  argsCopy[0] = {
    ...arg1,
    headers,
  };
  return argsCopy;
}
