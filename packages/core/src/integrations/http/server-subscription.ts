// oxlint-disable max-lines
/**
 * Provide the `http.server.request.start` subscription function that we use
 * to instrument incoming HTTP requests that use the `node:http` module.
 *
 * On Node.js v18.7 and up, we can just assign the diagnostics channel
 * listener, and that's enough. But for older node versions, or other SSJS
 * platforms, we have to explicitly fire the provided method an a patched
 * Server.emit method.
 *
 * This decision is made in the relevant Node/Bun/Deno SDKs; core just
 * provides them with the methods to use.
 *
 * When `options.spans` is enabled (explicitly or via the client's tracing
 * config), this also creates server spans around the emitted `'request'`
 * event. The OTel-mode node integration creates spans through a different
 * code path and opts out via explicit `spans: false`.
 */

import type { ServerSubscriptionName } from './constants';
type ChannelListener = (message: unknown, name: string | symbol) => void;
import { HTTP_ON_SERVER_REQUEST } from './constants';
import type { HttpIncomingMessage, HttpInstrumentationOptions, HttpServer, HttpServerResponse } from './types';
import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import { getClient, getCurrentScope, getIsolationScope, withIsolationScope } from '../../currentScopes';
import { hasSpansEnabled } from '../../utils/hasSpansEnabled';
import {
  getContentLengthFromHeaders,
  headersToDict,
  httpHeadersToSpanAttributes,
  httpRequestToRequestData,
} from '../../utils/request';
import { patchRequestToCaptureBody } from './patch-request-to-capture-body';
import { getUrlFragment, getUrlQuery, parseStringToURLObject, stripUrlQueryAndFragment } from '../../utils/url';
import { recordRequestSession } from './record-request-session';
import { generateSpanId, generateTraceId } from '../../utils/propagationContext';
import { continueTrace, startSpanManual } from '../../tracing/trace';
import { getSpanStatusFromHttpCode, SPAN_STATUS_ERROR } from '../../tracing';
import { hasSpanStreamingEnabled } from '../../tracing/spans/hasSpanStreamingEnabled';
import { HTTP_SPAN_NAME_FALLBACK } from '../../tracing/spans/spanNames';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { safeMathRandom } from '../../utils/randomSafeContext';
import type { SpanStatus } from '../../types/spanStatus';
import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  NETWORK_LOCAL_ADDRESS,
  NETWORK_LOCAL_PORT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  NETWORK_TRANSPORT,
  SENTRY_HTTP_PREFETCH,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FRAGMENT,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { filterCollectedUrl, filterCollectedUrlQuery } from '../../utils/data-collection/filterCollectedUrl';

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

const INTEGRATION_NAME = 'Http.Server';
const SPANS_INTEGRATION_NAME = 'Http.SentryServerSpans';

export type HttpServerSubscriptions = Record<ServerSubscriptionName, ChannelListener>;

// Tracks the last Sentry-created emit wrapper for each server so we can detect
// when user code has replaced server.emit (e.g. with a proxy of the original)
// and re-wrap it to restore Sentry's instrumentation.
const lastSentryEmitMap = new WeakMap<HttpServer, HttpServer['emit']>();

const kRequestMark = Symbol.for('sentry_http_server_instrumented');
type MarkedRequest = HttpIncomingMessage & {
  [kRequestMark]?: boolean;
};

/** return true if it is NOT already marked */
function markRequest(request: MarkedRequest): boolean {
  return !request[kRequestMark] && (request[kRequestMark] = true);
}

export function instrumentServer(options: HttpInstrumentationOptions, server: HttpServer): void {
  // Use a proxy and a WeakSet of server objects here, rather than a
  // wrappedFunction, because NestJS has been observed to "fork" emit
  // methods, including copying properties, leading to false positives.
  // Furthermore, we mark the Request object so that if two copies of this
  // instrumentation both are run on forked emit() methods for the same
  // request, we still only ever create a single root span. Previously,
  // this was done with a flag on the OTEL context, but in this non-OTEL
  // version, we mark the Request itself with a non-enumerable prop instead.

  // oxlint-disable-next-line typescript/unbound-method -- `this` is forwarded via Proxy/target.apply below
  const currentEmit = server.emit;
  const instrumentedEmit = lastSentryEmitMap.get(server);

  // Skip re-wrapping only if already instrumented AND server.emit still points
  // to our wrapper. If user code replaced server.emit (e.g. with a proxy of the
  // original pre-Sentry emit), re-wrap so Sentry's instrumentation is restored.
  if (currentEmit === instrumentedEmit) {
    return;
  }

  const newEmit = new Proxy(currentEmit, {
    apply(target, thisArg, args: unknown[]) {
      const [event, ...data] = args;
      if (event !== 'request') {
        return target.apply(thisArg, args);
      }

      const client = getClient();
      const [request, response] = data as [HttpIncomingMessage, HttpServerResponse];

      if (!client || !markRequest(request)) {
        return target.apply(thisArg, args);
      }

      DEBUG_BUILD && debug.log(INTEGRATION_NAME, 'Handling incoming request');
      const isolationScope = getIsolationScope().clone();
      isolationScope.setClient(client);

      const ipAddress = request.socket?.remoteAddress;
      const url = request.url || '/';
      const normalizedRequest = httpRequestToRequestData(request);
      const {
        maxRequestBodySize: configuredBodySize,
        ignoreRequestBody,
        sessions = true,
        sessionFlushingDelayMS = 60_000,
      } = options;

      const effectiveBodySize =
        configuredBodySize ??
        (client.getDataCollectionOptions().httpBodies.includes('incomingRequest') ? 'medium' : 'none');

      if (effectiveBodySize !== 'none' && !ignoreRequestBody?.(url, request)) {
        patchRequestToCaptureBody(request, isolationScope, effectiveBodySize, INTEGRATION_NAME);
      }

      // Update the isolation scope, isolate this request
      isolationScope.setSDKProcessingMetadata({ normalizedRequest, ipAddress });

      // attempt to update the scope's `transactionName` based on the request
      // URL. Ideally, framework instrumentations coming after the
      // HttpInstrumentation update the transactionName once we get a
      // parameterized route.
      const httpMethod = (request.method || 'GET').toUpperCase();
      const httpTargetWithoutQueryFragment = stripUrlQueryAndFragment(url);

      const bestEffortTransactionName = `${httpMethod} ${httpTargetWithoutQueryFragment}`;

      isolationScope.setTransactionName(bestEffortTransactionName);

      if (sessions) {
        recordRequestSession(client, {
          requestIsolationScope: isolationScope,
          response,
          sessionFlushingDelayMS: sessionFlushingDelayMS ?? 60_000,
        });
      }

      return withIsolationScope(isolationScope, () => {
        const sentryTrace = normalizedRequest.headers?.['sentry-trace'];
        const baggage = normalizedRequest.headers?.['baggage'];
        const sentryTraceValue = Array.isArray(sentryTrace) ? sentryTrace[0] : sentryTrace;
        return continueTrace(
          {
            sentryTrace: sentryTraceValue,
            baggage: Array.isArray(baggage) ? baggage[0] : baggage,
          },
          () => {
            const propagationContext = getCurrentScope().getPropagationContext();
            // Set propagationSpanId after continueTrace because it calls
            // withScope + setPropagationContext internally, which would
            // overwrite any previously set value.
            propagationContext.propagationSpanId = generateSpanId();
            // In OTel mode, continueTrace does not generate a new traceId
            // when there is no incoming sentry-trace header. We generate one
            // explicitly here so each request gets a unique trace ID even when
            // tracing is disabled.
            if (!sentryTraceValue) {
              propagationContext.traceId = generateTraceId();
              propagationContext.sampleRand = safeMathRandom();
            }

            response.once('close', () => {
              isolationScope.setContext('response', {
                status_code: response.statusCode,
              });
            });

            const wrap = options.wrapServerEmitRequest;
            let emitResult: boolean = false;
            if (wrap) {
              wrap(request, response, normalizedRequest, () => {
                emitResult = target.apply(thisArg, args) as boolean;
              });
            } else {
              emitResult = target.apply(thisArg, args) as boolean;
            }
            return emitResult;
          },
        );
      });
    },
  });

  lastSentryEmitMap.set(server, newEmit);
  server.emit = newEmit;
}

export function getHttpServerSubscriptions(options: HttpInstrumentationOptions): HttpServerSubscriptions {
  // The decision whether to create spans is evaluated per request (not once
  // here), so it stays responsive to client-state changes after setup. This
  // mirrors `getHttpClientSubscriptions`. Callers can force the no-span path
  // with explicit `spans: false` (the node OTel `httpServerIntegration` does
  // this because it creates spans through a separate code path).
  const userWrap = options.wrapServerEmitRequest;
  const spanWrap = buildServerSpanWrap(options);

  const effectiveOptions: HttpInstrumentationOptions = {
    ...options,
    wrapServerEmitRequest(request, response, normalizedRequest, next) {
      const clientOptions = getClient()?.getOptions();
      const createSpans = options.spans ?? (clientOptions ? hasSpansEnabled(clientOptions) : false);
      if (createSpans) {
        // spanWrap composes the user's wrap (outer) with span creation (inner).
        spanWrap(request, response, normalizedRequest, next);
      } else if (userWrap) {
        userWrap(request, response, normalizedRequest, next);
      } else {
        next();
      }
    },
  };

  const onHttpServerRequest: ChannelListener = (data: unknown): void => {
    const { server } = data as { server: HttpServer };
    instrumentServer(effectiveOptions, server);
  };

  return { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequest };
}

function buildServerSpanWrap(
  options: HttpInstrumentationOptions,
): NonNullable<HttpInstrumentationOptions['wrapServerEmitRequest']> {
  const {
    wrapServerEmitRequest: userWrap,
    ignoreIncomingRequests,
    ignoreStaticAssets = true,
    onSpanCreated,
    errorMonitor = 'error',
    onSpanEnd,
  } = options;

  return (request, response, normalizedRequest, next) => {
    if (typeof __SENTRY_TRACING__ !== 'undefined' && !__SENTRY_TRACING__) {
      return next();
    }

    // User wrap runs outside the span so it can set up context
    // (e.g. OTel propagation) before the span is created.
    return userWrap ? userWrap(request, response, normalizedRequest, createSpan) : createSpan();

    function createSpan(): unknown {
      const isolationScope = getIsolationScope();
      const client = isolationScope.getClient();
      if (!client) {
        return next();
      }

      const dataCollectionOptions = client.getDataCollectionOptions();

      if (
        shouldIgnoreSpansForIncomingRequest(request, {
          ignoreStaticAssets,
          ignoreIncomingRequests,
        })
      ) {
        DEBUG_BUILD && debug.log(SPANS_INTEGRATION_NAME, 'Skipping span creation for incoming request', request.url);
        return next();
      }

      const fullUrl = normalizedRequest.url || request.url || '/';
      const urlObj = parseStringToURLObject(fullUrl);
      const httpTargetWithoutQueryFragment = urlObj ? urlObj.pathname : stripUrlQueryAndFragment(fullUrl);
      const method = (request.method || 'GET').toUpperCase();
      // With span streaming, span names have to be low cardinality, so we can't fall back to the URL path.
      // Route instrumentations rename the span to `${method} ${route}` once a route is known.
      const name = hasSpanStreamingEnabled(client)
        ? request.method?.toUpperCase() || HTTP_SPAN_NAME_FALLBACK
        : `${method} ${httpTargetWithoutQueryFragment}`;
      const headers = request.headers;
      const userAgent = headers['user-agent'];
      const ips = headers['x-forwarded-for'];
      const httpVersion = request.httpVersion;
      const host = headers.host as undefined | string;
      const hostname = host?.replace(/^(.*)(:[0-9]{1,5})/, '$1') || 'localhost';
      const scheme = fullUrl.startsWith('https') ? 'https' : 'http';
      const { socket } = request;
      const { localAddress, localPort, remoteAddress, remotePort } = socket ?? {};
      const collectClientAddress = client.getDataCollectionOptions().userInfo;
      // `client.address` is the originating client, so a forwarding header wins over the socket, which
      // behind a proxy holds the proxy's address. `network.peer.address` keeps the socket value.
      const clientAddress = getForwardedClientAddress(ips) ?? remoteAddress;

      return startSpanManual(
        {
          name,
          attributes: {
            // Sentry-specific attributes
            [SENTRY_OP]: HTTP_SERVER,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.server',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
            [SENTRY_KIND]: 'server',
            // Network attributes
            [SERVER_ADDRESS]: hostname,
            [SERVER_PORT]: localPort,
            [NETWORK_LOCAL_ADDRESS]: localAddress,
            [NETWORK_LOCAL_PORT]: localPort,
            [CLIENT_ADDRESS]: collectClientAddress ? clientAddress : undefined,
            [CLIENT_PORT]: remotePort,
            [NETWORK_PEER_ADDRESS]: collectClientAddress ? remoteAddress : undefined,
            [NETWORK_PEER_PORT]: remotePort,
            [SENTRY_HTTP_PREFETCH]: isKnownPrefetchRequest(request) || undefined,
            [URL_FULL]: filterCollectedUrl(fullUrl, client),
            [URL_PATH]: urlObj?.pathname ?? httpTargetWithoutQueryFragment,
            [URL_QUERY]: filterCollectedUrlQuery(getUrlQuery(urlObj?.search), client),
            [URL_FRAGMENT]: getUrlFragment(urlObj?.hash),
            [HTTP_REQUEST_METHOD]: method,
            [NETWORK_PROTOCOL_NAME]: 'http',
            [NETWORK_PROTOCOL_VERSION]: httpVersion,
            [USER_AGENT_ORIGINAL]: userAgent,
            [URL_SCHEME]: scheme,
            [NETWORK_TRANSPORT]: httpVersion?.toUpperCase() === 'QUIC' ? 'udp' : 'tcp',
            'http.request.body.size': getContentLengthFromHeaders(request.headers),
            ...httpHeadersToSpanAttributes(normalizedRequest.headers || {}, dataCollectionOptions),
          },
        },
        span => {
          onSpanCreated?.(span, request, response);
          // Ensure we only end the span once
          // E.g. error can be emitted before close is emitted
          let isEnded = false;

          function endSpan(status: SpanStatus): void {
            if (isEnded) {
              return;
            }

            isEnded = true;
            // set attributes that come from the response
            span.setAttributes({
              'http.response.status_text': response.statusMessage?.toUpperCase(),
              [HTTP_RESPONSE_STATUS_CODE]: response.statusCode,
              ...httpHeadersToSpanAttributes(headersToDict(response.headers), dataCollectionOptions, 'response'),
            });
            span.setStatus(status);
            onSpanEnd?.(span, request, response);
            span.end();
          }

          response.once('close', () => {
            endSpan(getSpanStatusFromHttpCode(response.statusCode));
          });

          response.once(errorMonitor, () => {
            const httpStatus = getSpanStatusFromHttpCode(response.statusCode);
            // Ensure we def. have an error status here
            endSpan(httpStatus.code === SPAN_STATUS_ERROR ? httpStatus : { code: SPAN_STATUS_ERROR });
          });

          // Continue handling the request inside the active span context
          next();
        },
      );
    }
  };
}

/**
 * First entry of `X-Forwarded-For`: the client as seen by the outermost proxy.
 * https://opentelemetry.io/docs/specs/semconv/registry/attributes/client/#client-address
 */
function getForwardedClientAddress(forwardedFor: string | string[] | undefined): string | undefined {
  return typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() || undefined : undefined;
}

function shouldIgnoreSpansForIncomingRequest(
  request: HttpIncomingMessage,
  {
    ignoreStaticAssets,
    ignoreIncomingRequests,
  }: {
    ignoreStaticAssets?: boolean;
    ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;
  },
): boolean {
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

  if (ignoreIncomingRequests?.(urlPath, request)) {
    return true;
  }

  return false;
}

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

function isKnownPrefetchRequest(req: HttpIncomingMessage): boolean {
  // Currently only handles Next.js prefetch requests but may check other frameworks in the future.
  return req.headers['next-router-prefetch'] === '1';
}
