/* eslint-disable max-lines */
import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type * as http from 'node:http';
import type * as https from 'node:https';
import type { EventEmitter } from 'node:stream';
import { context, propagation } from '@opentelemetry/api';
import { VERSION } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import type { AggregationCounts, Client, SanitizedRequestData, Scope } from '@sentry/core';
import {
  addBreadcrumb,
  addNonEnumerableProperty,
  generateSpanId,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getSanitizedUrlString,
  httpRequestToRequestData,
  logger,
  parseUrl,
  stripUrlQueryAndFragment,
  withIsolationScope,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { getRequestUrl } from '../../utils/getRequestUrl';

const INSTRUMENTATION_NAME = '@sentry/instrumentation-http';

type Http = typeof http;
type Https = typeof https;

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
   * Do not capture breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * For the scope of this instrumentation, this callback only controls breadcrumb creation.
   * The same option can be passed to the top-level httpIntegration where it controls both, breadcrumb and
   * span creation.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string, request: http.RequestOptions) => boolean;

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   * This can be useful for long running requests where the body is not needed and we want to avoid capturing it.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreIncomingRequestBody?: (url: string, request: http.RequestOptions) => boolean;

  /**
   * Controls the maximum size of HTTP request bodies attached to events.
   *
   * Available options:
   * - 'none': No request bodies will be attached
   * - 'small': Request bodies up to 1,000 bytes will be attached
   * - 'medium': Request bodies up to 10,000 bytes will be attached (default)
   * - 'always': Request bodies will always be attached
   *
   * Note that even with 'always' setting, bodies exceeding 1MB will never be attached
   * for performance and security reasons.
   *
   * @default 'medium'
   */
  maxRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

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
    super(INSTRUMENTATION_NAME, VERSION, config);
  }

  /** @inheritdoc */
  public init(): [InstrumentationNodeModuleDefinition, InstrumentationNodeModuleDefinition] {
    // We register handlers when either http or https is instrumented
    // but we only want to register them once, whichever is loaded first
    let hasRegisteredHandlers = false;

    const onHttpServerRequestStart = ((_data: unknown) => {
      const data = _data as { server: http.Server };
      this._patchServerEmitOnce(data.server);
    }) satisfies ChannelListener;

    const onHttpClientResponseFinish = ((_data: unknown) => {
      const data = _data as { request: http.ClientRequest; response: http.IncomingMessage };
      this._onOutgoingRequestFinish(data.request, data.response);
    }) satisfies ChannelListener;

    const onHttpClientRequestError = ((_data: unknown) => {
      const data = _data as { request: http.ClientRequest };
      this._onOutgoingRequestFinish(data.request, undefined);
    }) satisfies ChannelListener;

    /**
     * You may be wondering why we register these diagnostics-channel listeners
     * in such a convoluted way (as InstrumentationNodeModuleDefinition...)˝,
     * instead of simply subscribing to the events once in here.
     * The reason for this is timing semantics: These functions are called once the http or https module is loaded.
     * If we'd subscribe before that, there seem to be conflicts with the OTEL native instrumentation in some scenarios,
     * especially the "import-on-top" pattern of setting up ESM applications.
     */
    return [
      new InstrumentationNodeModuleDefinition(
        'http',
        ['*'],
        (moduleExports: Http): Http => {
          if (hasRegisteredHandlers) {
            return moduleExports;
          }

          hasRegisteredHandlers = true;

          subscribe('http.server.request.start', onHttpServerRequestStart);
          subscribe('http.client.response.finish', onHttpClientResponseFinish);

          // When an error happens, we still want to have a breadcrumb
          // In this case, `http.client.response.finish` is not triggered
          subscribe('http.client.request.error', onHttpClientRequestError);

          return moduleExports;
        },
        () => {
          unsubscribe('http.server.request.start', onHttpServerRequestStart);
          unsubscribe('http.client.response.finish', onHttpClientResponseFinish);
          unsubscribe('http.client.request.error', onHttpClientRequestError);
        },
      ),
      new InstrumentationNodeModuleDefinition(
        'https',
        ['*'],
        (moduleExports: Https): Https => {
          if (hasRegisteredHandlers) {
            return moduleExports;
          }

          hasRegisteredHandlers = true;

          subscribe('http.server.request.start', onHttpServerRequestStart);
          subscribe('http.client.response.finish', onHttpClientResponseFinish);

          // When an error happens, we still want to have a breadcrumb
          // In this case, `http.client.response.finish` is not triggered
          subscribe('http.client.request.error', onHttpClientRequestError);

          return moduleExports;
        },
        () => {
          unsubscribe('http.server.request.start', onHttpServerRequestStart);
          unsubscribe('http.client.response.finish', onHttpClientResponseFinish);
          unsubscribe('http.client.request.error', onHttpClientRequestError);
        },
      ),
    ];
  }

  /**
   * This is triggered when an outgoing request finishes.
   * It has access to the final request and response objects.
   */
  private _onOutgoingRequestFinish(request: http.ClientRequest, response?: http.IncomingMessage): void {
    DEBUG_BUILD && logger.log(INSTRUMENTATION_NAME, 'Handling finished outgoing request');

    const _breadcrumbs = this.getConfig().breadcrumbs;
    const breadCrumbsEnabled = typeof _breadcrumbs === 'undefined' ? true : _breadcrumbs;
    const options = getRequestOptions(request);

    const _ignoreOutgoingRequests = this.getConfig().ignoreOutgoingRequests;
    const shouldCreateBreadcrumb =
      typeof _ignoreOutgoingRequests === 'function' ? !_ignoreOutgoingRequests(getRequestUrl(request), options) : true;

    if (breadCrumbsEnabled && shouldCreateBreadcrumb) {
      addRequestBreadcrumb(request, response);
    }
  }

  /**
   * Patch a server.emit function to handle process isolation for incoming requests.
   * This will only patch the emit function if it was not already patched.
   */
  private _patchServerEmitOnce(server: http.Server): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalEmit = server.emit;

    // This means it was already patched, do nothing
    if ((originalEmit as { __sentry_patched__?: boolean }).__sentry_patched__) {
      return;
    }

    DEBUG_BUILD && logger.log(INSTRUMENTATION_NAME, 'Patching server.emit');

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;
    const { ignoreIncomingRequestBody, maxRequestBodySize = 'medium' } = instrumentation.getConfig();

    const newEmit = new Proxy(originalEmit, {
      apply(target, thisArg, args: [event: string, ...args: unknown[]]) {
        // Only traces request events
        if (args[0] !== 'request') {
          return target.apply(thisArg, args);
        }

        DEBUG_BUILD && logger.log(INSTRUMENTATION_NAME, 'Handling incoming request');

        const isolationScope = getIsolationScope().clone();
        const request = args[1] as http.IncomingMessage;
        const response = args[2] as http.OutgoingMessage;

        const normalizedRequest = httpRequestToRequestData(request);

        // request.ip is non-standard but some frameworks set this
        const ipAddress = (request as { ip?: string }).ip || request.socket?.remoteAddress;

        const url = request.url || '/';
        if (!ignoreIncomingRequestBody?.(url, request) || maxRequestBodySize !== 'none') {
          patchRequestToCaptureBody(request, isolationScope, maxRequestBodySize);
        }

        // Update the isolation scope, isolate this request
        isolationScope.setSDKProcessingMetadata({ normalizedRequest, ipAddress });

        // attempt to update the scope's `transactionName` based on the request URL
        // Ideally, framework instrumentations coming after the HttpInstrumentation
        // update the transactionName once we get a parameterized route.
        const httpMethod = (request.method || 'GET').toUpperCase();
        const httpTarget = stripUrlQueryAndFragment(url);

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
            return target.apply(thisArg, args);
          }

          const ctx = propagation.extract(context.active(), normalizedRequest.headers);
          return context.with(ctx, () => {
            return target.apply(thisArg, args);
          });
        });
      },
    });

    addNonEnumerableProperty(newEmit, '__sentry_patched__', true);

    server.emit = newEmit;
  }
}

/** Add a breadcrumb for outgoing requests. */
function addRequestBreadcrumb(request: http.ClientRequest, response: http.IncomingMessage | undefined): void {
  const data = getBreadcrumbData(request);

  const statusCode = response?.statusCode;
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
function patchRequestToCaptureBody(
  req: http.IncomingMessage,
  isolationScope: Scope,
  maxRequestBodySize: 'none' | 'small' | 'medium' | 'always',
): void {
  let bodyByteLength = 0;
  const chunks: Buffer[] = [];

  DEBUG_BUILD && logger.log(INSTRUMENTATION_NAME, 'Patching request.on');

  /**
   * We need to keep track of the original callbacks, in order to be able to remove listeners again.
   * Since `off` depends on having the exact same function reference passed in, we need to be able to map
   * original listeners to our wrapped ones.
   */
  const callbackMap = new WeakMap();

  if (maxRequestBodySize === 'none') {
    return;
  }

  const maxBodySize =
    maxRequestBodySize === 'small' ? 1_000 : maxRequestBodySize === 'medium' ? 10_000 : MAX_BODY_BYTE_LENGTH;

  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.on = new Proxy(req.on, {
      apply: (target, thisArg, args: Parameters<typeof req.on>) => {
        const [event, listener, ...restArgs] = args;

        if (event === 'data') {
          if (DEBUG_BUILD) {
            logger.log(INSTRUMENTATION_NAME, 'Handling request.on("data")');
            logger.log(INSTRUMENTATION_NAME, `Requested maximum body size: ${maxBodySize}b`);
          }
          const callback = new Proxy(listener, {
            apply: (target, thisArg, args: Parameters<typeof listener>) => {
              try {
                const chunk = args[0] as Buffer | string;
                const bufferifiedChunk = Buffer.from(chunk);

                if (bodyByteLength < maxBodySize) {
                  chunks.push(bufferifiedChunk);
                  bodyByteLength += bufferifiedChunk.byteLength;
                } else if (DEBUG_BUILD) {
                  logger.log(
                    INSTRUMENTATION_NAME,
                    `Dropping request body chunk because maximum body length of ${maxBodySize}b is exceeded.`,
                  );
                }
              } catch (err) {
                DEBUG_BUILD && logger.error(INSTRUMENTATION_NAME, 'Encountered error while storing body chunk.');
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

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (body) {
          // Using Buffer.byteLength here, because the body may contain characters that are not 1 byte long
          const bodyByteLength = Buffer.byteLength(body, 'utf-8');
          const truncatedBody =
            bodyByteLength > maxBodySize
              ? `${Buffer.from(body)
                  .subarray(0, maxBodySize - 3)
                  .toString('utf-8')}...`
              : body;

          isolationScope.setSDKProcessingMetadata({ normalizedRequest: { data: truncatedBody } });
        }
      } catch (error) {
        if (DEBUG_BUILD) {
          logger.error(INSTRUMENTATION_NAME, 'Error building captured request body', error);
        }
      }
    });
  } catch (error) {
    if (DEBUG_BUILD) {
      logger.error(INSTRUMENTATION_NAME, 'Error patching request to capture body', error);
    }
  }
}

function getRequestOptions(request: http.ClientRequest): http.RequestOptions {
  return {
    method: request.method,
    protocol: request.protocol,
    host: request.host,
    hostname: request.host,
    path: request.path,
    headers: request.getHeaders(),
  };
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
