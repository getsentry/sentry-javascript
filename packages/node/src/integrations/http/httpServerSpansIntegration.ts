/* eslint-disable max-lines */
import { errorMonitor } from 'node:events';
import type { IncomingHttpHeaders } from 'node:http';
import {
  HTTP_CLIENT_IP,
  HTTP_FLAVOR,
  HTTP_HOST,
  HTTP_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_SCHEME,
  HTTP_STATUS_CODE,
  HTTP_TARGET,
  HTTP_USER_AGENT,
  NET_HOST_IP,
  NET_HOST_NAME,
  NET_HOST_PORT,
  NET_PEER_IP,
  NET_PEER_PORT,
  NET_TRANSPORT,
  SENTRY_HTTP_PREFETCH,
  URL_FRAGMENT,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';
import type {
  Event,
  HttpClientRequest,
  HttpIncomingMessage,
  HttpServerResponse,
  Integration,
  IntegrationFn,
  Span,
  SpanAttributes,
  SpanStatus,
} from '@sentry/core';
import {
  debug,
  getSpanStatusFromHttpCode,
  httpHeadersToSpanAttributes,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  stripUrlQueryAndFragment,
  isTracingSuppressed,
  bindScopeToEmitter,
  startInactiveSpan,
  withActiveSpan,
  getUrlFragment,
  getUrlQuery,
  filterCollectedUrl,
  filterCollectedUrlQuery,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { NodeClient } from '../../sdk/client';
import { addStartSpanCallback } from './httpServerIntegration';

const INTEGRATION_NAME = 'Http.ServerSpans' as const;

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

export interface HttpServerSpansIntegrationOptions {
  /**
   * Do not capture spans for incoming HTTP requests to URLs where the given callback returns `true`.
   * Spans will be non recording if tracing is disabled.
   *
   * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
   * For example: `'/users/details?id=123'`
   *
   * The `request` param contains the original {@type IncomingMessage} object of the incoming request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;

  /**
   * Whether to automatically ignore common static asset requests like favicon.ico, robots.txt, etc.
   * This helps reduce noise in your transactions.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * @deprecated This is deprecated in favor of `incomingRequestSpanHook`.
   */
  instrumentation?: {
    requestHook?: (span: Span, req: HttpClientRequest | HttpIncomingMessage) => void;
    responseHook?: (span: Span, response: HttpIncomingMessage | HttpServerResponse) => void;
    applyCustomAttributesOnSpan?: (
      span: Span,
      request: HttpClientRequest | HttpIncomingMessage,
      response: HttpIncomingMessage | HttpServerResponse,
    ) => void;
  };

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, but before it is recorded.
   */
  onSpanCreated?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;
}

const _httpServerSpansIntegration = ((options: HttpServerSpansIntegrationOptions = {}) => {
  const ignoreStaticAssets = options.ignoreStaticAssets ?? true;
  const ignoreIncomingRequests = options.ignoreIncomingRequests;

  const { onSpanCreated } = options;
  // eslint-disable-next-line typescript/no-deprecated
  const { requestHook, responseHook, applyCustomAttributesOnSpan } = options.instrumentation ?? {};

  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      // If no tracing, we can just skip everything here
      if (typeof __SENTRY_TRACING__ !== 'undefined' && !__SENTRY_TRACING__) {
        return;
      }

      client.on('httpServerRequest', (_request, _response, normalizedRequest) => {
        // Type-casting this here because we do not want to put the node types into core
        const request = _request as HttpIncomingMessage;
        const response = _response as HttpServerResponse;

        const startSpan = (next: () => boolean): boolean => {
          if (
            shouldIgnoreSpansForIncomingRequest(request, {
              ignoreStaticAssets,
              ignoreIncomingRequests,
            })
          ) {
            DEBUG_BUILD && debug.log(INTEGRATION_NAME, 'Skipping span creation for incoming request', request.url);
            return next();
          }

          const fullUrl = normalizedRequest.url || request.url || '/';
          const urlObj = parseStringToURLObject(fullUrl);

          const headers = request.headers;
          const userAgent = headers['user-agent'];
          const ips = headers['x-forwarded-for'];
          const httpVersion = request.httpVersion;
          const host = headers.host as string | undefined;
          const hostname = host?.replace(/^(.*)(:[0-9]{1,5})/, '$1') || 'localhost';

          const scheme = fullUrl.startsWith('https') ? 'https' : 'http';

          const method = normalizedRequest.method || request.method?.toUpperCase() || 'GET';
          const httpTargetWithoutQueryFragment = urlObj ? urlObj.pathname : stripUrlQueryAndFragment(fullUrl);
          const bestEffortTransactionName = `${method} ${httpTargetWithoutQueryFragment}`;

          const query = getUrlQuery(urlObj?.search);
          const fragment = getUrlFragment(urlObj?.hash);

          const span = startInactiveSpan({
            name: bestEffortTransactionName,
            attributes: {
              // Sentry specific attributes
              [SENTRY_KIND]: 'server',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.http',
              [SENTRY_HTTP_PREFETCH]: isKnownPrefetchRequest(request) || undefined,
              [URL_FULL]: filterCollectedUrl(fullUrl, client),
              [URL_PATH]: urlObj?.pathname ?? httpTargetWithoutQueryFragment,
              [URL_QUERY]: filterCollectedUrlQuery(query, client),
              [URL_FRAGMENT]: fragment,
              // Old Semantic Conventions attributes - added for compatibility with what `@opentelemetry/instrumentation-http` output before
              /* eslint-disable typescript/no-deprecated */
              [HTTP_METHOD]: normalizedRequest.method,
              [HTTP_TARGET]: filterCollectedUrl(
                urlObj ? `${urlObj.pathname}${urlObj.search}` : httpTargetWithoutQueryFragment,
                client,
              ),
              [HTTP_HOST]: host,
              [NET_HOST_NAME]: hostname,
              [HTTP_CLIENT_IP]: typeof ips === 'string' ? ips.split(',')[0] : undefined,
              [HTTP_USER_AGENT]: userAgent,
              [HTTP_SCHEME]: scheme,
              [HTTP_FLAVOR]: httpVersion,
              [NET_TRANSPORT]: httpVersion?.toUpperCase() === 'QUIC' ? 'ip_udp' : 'ip_tcp',
              /* eslint-enable typescript/no-deprecated */
              ...getRequestContentLengthAttribute(request),
              ...httpHeadersToSpanAttributes(normalizedRequest.headers || {}, client.getDataCollectionOptions()),
            },
          });

          // TODO v11: Remove the following three hooks, only onSpanCreated should remain
          requestHook?.(span, request);
          responseHook?.(span, response);
          applyCustomAttributesOnSpan?.(span, request, response);
          onSpanCreated?.(span, request, response);

          return withActiveSpan(span, () => {
            bindScopeToEmitter(request);
            bindScopeToEmitter(response);

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
            }

            response.on('close', () => {
              endSpan(getSpanStatusFromHttpCode(response.statusCode));
            });
            response.on(errorMonitor, () => {
              const httpStatus = getSpanStatusFromHttpCode(response.statusCode);
              // Ensure we def. have an error status here
              endSpan(httpStatus.code === SPAN_STATUS_ERROR ? httpStatus : { code: SPAN_STATUS_ERROR });
            });

            return next();
          });
        };

        addStartSpanCallback(request, startSpan);
      });
    },
    afterAllSetup(client) {
      if (!DEBUG_BUILD) {
        return;
      }

      if (client.getIntegrationByName('Http')) {
        debug.warn(
          'It seems that you have manually added `httpServerSpansIntegration` while `httpIntegration` is also present. Make sure to remove `httpIntegration` when adding `httpServerSpansIntegration`.',
        );
      }

      if (!client.getIntegrationByName('Http.Server')) {
        debug.error(
          'It seems that you have manually added `httpServerSpansIntegration` without adding `httpServerIntegration`. This is a requiement for spans to be created - please add the `httpServerIntegration` integration.',
        );
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * This integration emits spans for incoming requests handled via the node `http` module.
 * It requires the `httpServerIntegration` to be present.
 */
export const httpServerSpansIntegration = _httpServerSpansIntegration as (
  options?: HttpServerSpansIntegrationOptions,
) => Integration & {
  name: 'Http.ServerSpans';
  setup: (client: NodeClient) => void;
  processEvent: (event: Event) => Event | null;
};

function isKnownPrefetchRequest(req: HttpIncomingMessage): boolean {
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
  request: HttpIncomingMessage,
  {
    ignoreStaticAssets,
    ignoreIncomingRequests,
  }: {
    ignoreStaticAssets?: boolean;
    ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;
  },
): boolean {
  if (isTracingSuppressed()) {
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

  if (ignoreIncomingRequests?.(urlPath, request)) {
    return true;
  }

  return false;
}

function getRequestContentLengthAttribute(request: HttpIncomingMessage): SpanAttributes {
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

  const contentLength = parseInt(contentLengthHeader, 10);
  if (isNaN(contentLength)) return null;

  return contentLength;
}

function isCompressed(headers: IncomingHttpHeaders): boolean {
  const encoding = headers['content-encoding'];

  return !!encoding && encoding !== 'identity';
}

function getIncomingRequestAttributesOnResponse(
  request: HttpIncomingMessage,
  response: HttpServerResponse,
): SpanAttributes {
  // take socket from the request,
  // since it may be detached from the response object in keep-alive mode
  const { socket } = request;
  const { statusCode, statusMessage } = response;

  const newAttributes: SpanAttributes = {
    [HTTP_RESPONSE_STATUS_CODE]: statusCode,
    // eslint-disable-next-line typescript/no-deprecated
    [HTTP_STATUS_CODE]: statusCode,
    'http.status_text': statusMessage?.toUpperCase(),
  };

  if (socket) {
    const { localAddress, localPort, remoteAddress, remotePort } = socket;
    // eslint-disable-next-line typescript/no-deprecated
    newAttributes[NET_HOST_IP] = localAddress;
    // eslint-disable-next-line typescript/no-deprecated
    newAttributes[NET_HOST_PORT] = localPort;
    // eslint-disable-next-line typescript/no-deprecated
    newAttributes[NET_PEER_IP] = remoteAddress;
    // oxlint-disable-next-line typescript/no-deprecated
    newAttributes[NET_PEER_PORT] = remotePort;
  }

  return newAttributes;
}
