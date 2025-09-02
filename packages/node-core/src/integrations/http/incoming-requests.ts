/* eslint-disable max-lines */
import type { Span } from '@opentelemetry/api';
import { context, createContextKey, propagation, trace } from '@opentelemetry/api';
import type { RPCMetadata } from '@opentelemetry/core';
import { getRPCMetadata, isTracingSuppressed, RPCType, setRPCMetadata } from '@opentelemetry/core';
import {
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_NET_HOST_IP,
  SEMATTRS_NET_HOST_PORT,
  SEMATTRS_NET_PEER_IP,
} from '@opentelemetry/semantic-conventions';
import type { AggregationCounts, Client, Scope, SpanAttributes, SpanStatus } from '@sentry/core';
import {
  debug,
  generateSpanId,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getSpanStatusFromHttpCode,
  httpRequestToRequestData,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  stripUrlQueryAndFragment,
  withIsolationScope,
} from '@sentry/core';
import type EventEmitter from 'events';
import { errorMonitor } from 'events';
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'http';
import type { Socket } from 'net';
import { DEBUG_BUILD } from '../../debug-build';
import type { NodeClient } from '../../sdk/client';
import { INSTRUMENTATION_NAME, MAX_BODY_BYTE_LENGTH } from './constants';

type ServerEmit = typeof Server.prototype.emit;

const HTTP_SERVER_INSTRUMENTED_KEY = createContextKey('sentry_http_server_instrumented');

const clientToRequestSessionAggregatesMap = new Map<
  Client,
  { [timestampRoundedToSeconds: string]: { exited: number; crashed: number; errored: number } }
>();

// We keep track of emit functions we wrapped, to avoid double wrapping
// We do this instead of putting a non-enumerable property on the function, because
// sometimes the property seems to be migrated to forks of the emit function, which we do not want to happen
// This was the case in the nestjs-distributed-tracing E2E test
const wrappedEmitFns = new WeakSet<ServerEmit>();

/**
 * Instrument a server to capture incoming requests.
 *
 */
export function instrumentServer(
  server: Server,
  {
    ignoreIncomingRequestBody,
    ignoreSpansForIncomingRequests,
    maxIncomingRequestBodySize = 'medium',
    trackIncomingRequestsAsSessions = true,
    spans,
    ignoreStaticAssets = true,
    sessionFlushingDelayMS,
    // eslint-disable-next-line deprecation/deprecation
    instrumentation,
    incomingRequestSpanHook,
  }: {
    ignoreIncomingRequestBody?: (url: string, request: IncomingMessage) => boolean;
    ignoreSpansForIncomingRequests?: (urlPath: string, request: IncomingMessage) => boolean;
    maxIncomingRequestBodySize?: 'small' | 'medium' | 'always' | 'none';
    trackIncomingRequestsAsSessions?: boolean;
    sessionFlushingDelayMS: number;
    spans: boolean;
    ignoreStaticAssets?: boolean;
    incomingRequestSpanHook?: (span: Span, request: IncomingMessage, response: ServerResponse) => void;
    /** @deprecated Use `incomingRequestSpanHook` instead. */
    instrumentation?: {
      requestHook?: (span: Span, req: IncomingMessage | ClientRequest) => void;
      responseHook?: (span: Span, response: ServerResponse | IncomingMessage) => void;
      applyCustomAttributesOnSpan?: (
        span: Span,
        request: IncomingMessage | ClientRequest,
        response: ServerResponse | IncomingMessage,
      ) => void;
    };
  },
): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalEmit: ServerEmit = server.emit;

  if (wrappedEmitFns.has(originalEmit)) {
    DEBUG_BUILD &&
      debug.log(INSTRUMENTATION_NAME, 'Incoming requests already instrumented, not instrumenting again...');
    return;
  }

  const { requestHook, responseHook, applyCustomAttributesOnSpan } = instrumentation ?? {};

  const newEmit = new Proxy(originalEmit, {
    apply(target, thisArg, args: [event: string, ...args: unknown[]]) {
      // Only traces request events
      if (args[0] !== 'request') {
        return target.apply(thisArg, args);
      }

      // Make sure we do not double execute our wrapper code, for edge cases...
      // Without this check, if we double-wrap emit, for whatever reason, you'd get two http.server spans (one the children of the other)
      if (context.active().getValue(HTTP_SERVER_INSTRUMENTED_KEY)) {
        return target.apply(thisArg, args);
      }

      DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Handling incoming request');

      const client = getClient<NodeClient>();
      const isolationScope = getIsolationScope().clone();
      const request = args[1] as IncomingMessage;
      const response = args[2] as ServerResponse & { socket: Socket };

      const normalizedRequest = httpRequestToRequestData(request);

      // request.ip is non-standard but some frameworks set this
      const ipAddress = (request as { ip?: string }).ip || request.socket?.remoteAddress;

      const url = request.url || '/';
      if (maxIncomingRequestBodySize !== 'none' && !ignoreIncomingRequestBody?.(url, request)) {
        patchRequestToCaptureBody(request, isolationScope, maxIncomingRequestBodySize);
      }

      // Update the isolation scope, isolate this request
      isolationScope.setSDKProcessingMetadata({ normalizedRequest, ipAddress });

      // attempt to update the scope's `transactionName` based on the request URL
      // Ideally, framework instrumentations coming after the HttpInstrumentation
      // update the transactionName once we get a parameterized route.
      const httpMethod = (request.method || 'GET').toUpperCase();
      const httpTargetWithoutQueryFragment = stripUrlQueryAndFragment(url);

      const bestEffortTransactionName = `${httpMethod} ${httpTargetWithoutQueryFragment}`;

      isolationScope.setTransactionName(bestEffortTransactionName);

      if (trackIncomingRequestsAsSessions !== false) {
        recordRequestSession({
          requestIsolationScope: isolationScope,
          response,
          sessionFlushingDelayMS: sessionFlushingDelayMS ?? 60_000,
        });
      }

      return withIsolationScope(isolationScope, () => {
        // Set a new propagationSpanId for this request
        // We rely on the fact that `withIsolationScope()` will implicitly also fork the current scope
        // This way we can save an "unnecessary" `withScope()` invocation
        getCurrentScope().getPropagationContext().propagationSpanId = generateSpanId();

        const ctx = propagation
          .extract(context.active(), normalizedRequest.headers)
          .setValue(HTTP_SERVER_INSTRUMENTED_KEY, true);

        return context.with(ctx, () => {
          // if opting out of span creation, we can end here
          if (
            !spans ||
            !client ||
            shouldIgnoreSpansForIncomingRequest(request, {
              ignoreStaticAssets,
              ignoreSpansForIncomingRequests,
            })
          ) {
            DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Skipping span creation for incoming request');
            return target.apply(thisArg, args);
          }

          const fullUrl = normalizedRequest.url || url;
          const urlObj = parseStringToURLObject(fullUrl);

          const headers = request.headers;
          const userAgent = headers['user-agent'];
          const ips = headers['x-forwarded-for'];
          const httpVersion = request.httpVersion;
          const host = headers.host;
          const hostname = host?.replace(/^(.*)(:[0-9]{1,5})/, '$1') || 'localhost';

          const scheme = fullUrl.startsWith('https') ? 'https' : 'http';

          const span = startInactiveSpan({
            name: bestEffortTransactionName,
            attributes: {
              'otel.kind': 'SERVER',
              // Sentry specific attributes
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.http',
              'sentry.http.prefetch': isKnownPrefetchRequest(request) || undefined,
              // Old Semantic Conventions attributes - added for compatibility with what `@opentelemetry/instrumentation-http` output before
              'http.url': fullUrl,
              'http.method': httpMethod,
              'http.target': urlObj ? `${urlObj.pathname}${urlObj.search}` : httpTargetWithoutQueryFragment,
              'http.host': host,
              'net.host.name': hostname,
              'http.client_ip': typeof ips === 'string' ? ips.split(',')[0] : undefined,
              'http.user_agent': userAgent,
              'http.scheme': scheme,
              'http.flavor': httpVersion,
              'net.transport': httpVersion?.toUpperCase() === 'QUIC' ? 'ip_udp' : 'ip_tcp',
              ...getRequestContentLengthAttribute(request),
            },
          });

          // TODO v11: Remove the following three hooks, only incomingRequestSpanHook should remain
          requestHook?.(span, request);
          responseHook?.(span, response);
          applyCustomAttributesOnSpan?.(span, request, response);
          incomingRequestSpanHook?.(span, request, response);

          const rpcMetadata: RPCMetadata = {
            type: RPCType.HTTP,
            span,
          };

          context.with(setRPCMetadata(trace.setSpan(context.active(), span), rpcMetadata), () => {
            context.bind(context.active(), request);
            context.bind(context.active(), response);

            // Ensure we only end the span once
            // E.g. error can be emitted before close is emitted
            let isEnded = false;
            function endSpan(status: SpanStatus): void {
              if (isEnded) {
                return;
              }

              isEnded = true;

              const newAttributes = getIncomingRequestAttributesOnResponse(request, response);
              span.setAttributes(newAttributes);
              span.setStatus(status);
              span.end();

              // Update the transaction name if the route has changed
              const route = newAttributes['http.route'];
              if (route) {
                getIsolationScope().setTransactionName(`${request.method?.toUpperCase() || 'GET'} ${route}`);
              }
            }

            response.on('close', () => {
              endSpan(getSpanStatusFromHttpCode(response.statusCode));
            });
            response.on(errorMonitor, () => {
              const httpStatus = getSpanStatusFromHttpCode(response.statusCode);
              // Ensure we def. have an error status here
              endSpan(httpStatus.code === SPAN_STATUS_ERROR ? httpStatus : { code: SPAN_STATUS_ERROR });
            });

            return target.apply(thisArg, args);
          });
        });
      });
    },
  });

  wrappedEmitFns.add(newEmit);
  server.emit = newEmit;
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
      DEBUG_BUILD && debug.log(`Recorded request session with status: ${requestSession.status}`);

      const roundedDate = new Date();
      roundedDate.setSeconds(0, 0);
      const dateBucketKey = roundedDate.toISOString();

      const existingClientAggregate = clientToRequestSessionAggregatesMap.get(client);
      const bucket = existingClientAggregate?.[dateBucketKey] || { exited: 0, crashed: 0, errored: 0 };
      bucket[({ ok: 'exited', crashed: 'crashed', errored: 'errored' } as const)[requestSession.status]]++;

      if (existingClientAggregate) {
        existingClientAggregate[dateBucketKey] = bucket;
      } else {
        DEBUG_BUILD && debug.log('Opened new request session aggregate.');
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
          DEBUG_BUILD && debug.log('Sending request session aggregate due to client flush');
          flushPendingClientAggregates();
        });
        const timeout = setTimeout(() => {
          DEBUG_BUILD && debug.log('Sending request session aggregate due to flushing schedule');
          flushPendingClientAggregates();
        }, sessionFlushingDelayMS).unref();
      }
    }
  });
}

/**
 * This method patches the request object to capture the body.
 * Instead of actually consuming the streamed body ourselves, which has potential side effects,
 * we monkey patch `req.on('data')` to intercept the body chunks.
 * This way, we only read the body if the user also consumes the body, ensuring we do not change any behavior in unexpected ways.
 */
function patchRequestToCaptureBody(
  req: IncomingMessage,
  isolationScope: Scope,
  maxIncomingRequestBodySize: 'small' | 'medium' | 'always',
): void {
  let bodyByteLength = 0;
  const chunks: Buffer[] = [];

  DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Patching request.on');

  /**
   * We need to keep track of the original callbacks, in order to be able to remove listeners again.
   * Since `off` depends on having the exact same function reference passed in, we need to be able to map
   * original listeners to our wrapped ones.
   */
  const callbackMap = new WeakMap();

  const maxBodySize =
    maxIncomingRequestBodySize === 'small'
      ? 1_000
      : maxIncomingRequestBodySize === 'medium'
        ? 10_000
        : MAX_BODY_BYTE_LENGTH;

  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.on = new Proxy(req.on, {
      apply: (target, thisArg, args: Parameters<typeof req.on>) => {
        const [event, listener, ...restArgs] = args;

        if (event === 'data') {
          DEBUG_BUILD &&
            debug.log(INSTRUMENTATION_NAME, `Handling request.on("data") with maximum body size of ${maxBodySize}b`);

          const callback = new Proxy(listener, {
            apply: (target, thisArg, args: Parameters<typeof listener>) => {
              try {
                const chunk = args[0] as Buffer | string;
                const bufferifiedChunk = Buffer.from(chunk);

                if (bodyByteLength < maxBodySize) {
                  chunks.push(bufferifiedChunk);
                  bodyByteLength += bufferifiedChunk.byteLength;
                } else if (DEBUG_BUILD) {
                  debug.log(
                    INSTRUMENTATION_NAME,
                    `Dropping request body chunk because maximum body length of ${maxBodySize}b is exceeded.`,
                  );
                }
              } catch (err) {
                DEBUG_BUILD && debug.error(INSTRUMENTATION_NAME, 'Encountered error while storing body chunk.');
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
          debug.error(INSTRUMENTATION_NAME, 'Error building captured request body', error);
        }
      }
    });
  } catch (error) {
    if (DEBUG_BUILD) {
      debug.error(INSTRUMENTATION_NAME, 'Error patching request to capture body', error);
    }
  }
}

function getRequestContentLengthAttribute(request: IncomingMessage): SpanAttributes {
  const length = getContentLength(request.headers);
  if (length == null) {
    return {};
  }

  if (isCompressed(request.headers)) {
    return {
      ['http.request_content_length']: length,
    };
  } else {
    return {
      ['http.request_content_length_uncompressed']: length,
    };
  }
}

function getContentLength(headers: IncomingHttpHeaders): number | null {
  const contentLengthHeader = headers['content-length'];
  if (contentLengthHeader === undefined) return null;

  const contentLength = parseInt(contentLengthHeader as string, 10);
  if (isNaN(contentLength)) return null;

  return contentLength;
}

function isCompressed(headers: IncomingHttpHeaders): boolean {
  const encoding = headers['content-encoding'];

  return !!encoding && encoding !== 'identity';
}

function getIncomingRequestAttributesOnResponse(request: IncomingMessage, response: ServerResponse): SpanAttributes {
  // take socket from the request,
  // since it may be detached from the response object in keep-alive mode
  const { socket } = request;
  const { statusCode, statusMessage } = response;

  const newAttributes: SpanAttributes = {
    [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
    // eslint-disable-next-line deprecation/deprecation
    [SEMATTRS_HTTP_STATUS_CODE]: statusCode,
    'http.status_text': statusMessage?.toUpperCase(),
  };

  const rpcMetadata = getRPCMetadata(context.active());
  if (socket) {
    const { localAddress, localPort, remoteAddress, remotePort } = socket;
    // eslint-disable-next-line deprecation/deprecation
    newAttributes[SEMATTRS_NET_HOST_IP] = localAddress;
    // eslint-disable-next-line deprecation/deprecation
    newAttributes[SEMATTRS_NET_HOST_PORT] = localPort;
    // eslint-disable-next-line deprecation/deprecation
    newAttributes[SEMATTRS_NET_PEER_IP] = remoteAddress;
    newAttributes['net.peer.port'] = remotePort;
  }
  // eslint-disable-next-line deprecation/deprecation
  newAttributes[SEMATTRS_HTTP_STATUS_CODE] = statusCode;
  newAttributes['http.status_text'] = (statusMessage || '').toUpperCase();

  if (rpcMetadata?.type === RPCType.HTTP && rpcMetadata.route !== undefined) {
    const routeName = rpcMetadata.route;
    newAttributes[ATTR_HTTP_ROUTE] = routeName;
  }

  return newAttributes;
}

function isKnownPrefetchRequest(req: IncomingMessage): boolean {
  // Currently only handles Next.js prefetch requests but may check other frameworks in the future.
  return req.headers['next-router-prefetch'] === '1';
}

/**
 * Check if a request is for a common static asset that should be ignored by default.
 *
 * Only exported for tests.
 */
export function isStaticAssetRequest(urlPath: string): boolean {
  const path = stripUrlQueryAndFragment(urlPath);
  // Common static file extensions
  if (path.match(/\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot|webp|avif)$/)) {
    return true;
  }

  // Common metadata files
  if (path.match(/^\/(robots\.txt|sitemap\.xml|manifest\.json|browserconfig\.xml)$/)) {
    return true;
  }

  return false;
}

function shouldIgnoreSpansForIncomingRequest(
  request: IncomingMessage,
  {
    ignoreStaticAssets,
    ignoreSpansForIncomingRequests,
  }: {
    ignoreStaticAssets?: boolean;
    ignoreSpansForIncomingRequests?: (urlPath: string, request: IncomingMessage) => boolean;
  },
): boolean {
  if (isTracingSuppressed(context.active())) {
    return true;
  }

  // request.url is the only property that holds any information about the url
  // it only consists of the URL path and query string (if any)
  const urlPath = request.url;

  const method = request.method?.toUpperCase();
  // We do not capture OPTIONS/HEAD requests as spans
  if (method === 'OPTIONS' || method === 'HEAD' || !urlPath) {
    return true;
  }

  // Default static asset filtering
  if (ignoreStaticAssets && method === 'GET' && isStaticAssetRequest(urlPath)) {
    return true;
  }

  if (ignoreSpansForIncomingRequests?.(urlPath, request)) {
    return true;
  }

  return false;
}
