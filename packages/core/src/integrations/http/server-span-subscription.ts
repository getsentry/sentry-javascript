import { getIsolationScope } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { parseStringToURLObject, stripUrlQueryAndFragment } from '../../utils/url';
import { getHttpServerSubscriptions, type HttpServerSubscriptions } from './server-subscription';
import type { HttpIncomingMessage, HttpInstrumentationOptions } from './types';
import { debug } from '../../utils/debug-logger';
import { getSpanStatusFromHttpCode, SPAN_STATUS_ERROR, startSpanManual } from '../../tracing';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../semanticAttributes';
import { SpanAttributes } from '../../types-hoist/span';
import { headersToDict, httpHeadersToSpanAttributes } from '../../utils/request';
import { SpanStatus } from '../../types-hoist/spanStatus';

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

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

const INTEGRATION_NAME = 'Http.SentryServerSpans';

export function getHttpServerSpanSubscriptions(options: HttpInstrumentationOptions): HttpServerSubscriptions {
  const {
    wrapServerEmitRequest: wrap,
    ignoreIncomingRequests,
    ignoreStaticAssets,
    onSpanCreated,
    errorMonitor = 'error',
    onSpanEnd,
  } = options;

  return getHttpServerSubscriptions({
    ...options,
    wrapServerEmitRequest(request, response, normalizedRequest, _next) {
      if (typeof __SENTRY_TRACING__ !== 'undefined' && !__SENTRY_TRACING__) {
        return _next();
      }

      // If the user provided a wrapServerEmitRequest, call it as the outer
      // wrapper so it can set up context (e.g. OTel propagation) before the
      // span is created.
      return wrap ? wrap(request, response, normalizedRequest, createSpan) : createSpan();

      function createSpan() {
        const isolationScope = getIsolationScope();
        const client = isolationScope.getClient();
        if (!client) {
          return _next();
        }

        if (
          shouldIgnoreSpansForIncomingRequest(request, {
            ignoreStaticAssets,
            ignoreIncomingRequests,
          })
        ) {
          DEBUG_BUILD && debug.log(INTEGRATION_NAME, 'Skipping span creation for incoming request', request.url);
          return _next();
        }

        const fullUrl = normalizedRequest.url || request.url || '/';
        const urlObj = parseStringToURLObject(fullUrl);
        const httpTargetWithoutQueryFragment = urlObj ? urlObj.pathname : stripUrlQueryAndFragment(fullUrl);
        const method = (request.method || 'GET').toUpperCase();
        const name = `${method} ${httpTargetWithoutQueryFragment}`;
        const headers = request.headers;
        const userAgent = headers['user-agent'];
        const ips = headers['x-forwarded-for'];
        const httpVersion = request.httpVersion;
        const host = headers.host as undefined | string;
        const hostname = host?.replace(/^(.*)(:[0-9]{1,5})/, '$1') || 'localhost';
        const scheme = fullUrl.startsWith('https') ? 'https' : 'http';
        const { socket } = request;
        const { localAddress, localPort, remoteAddress, remotePort } = socket ?? {};

        return startSpanManual(
          {
            name,
            // SpanKind.SERVER = 1; pass this so the OTel sampler infers
            // op='http.server' rather than 'http', which it does for
            // SpanKind.INTERNAL = 0, the default
            kind: 1,
            attributes: {
              // Sentry-specific attributes
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.http',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
              // Set http.route to the URL path as a best-effort route name.
              // Framework integrations (Express, etc.) update this via onSpanEnd.
              'http.route': httpTargetWithoutQueryFragment,
              // OTel kind (explicit attribute so it appears in span data)
              'otel.kind': 'SERVER',
              // Network attributes
              'net.host.ip': localAddress,
              'net.host.port': localPort,
              'net.peer.ip': remoteAddress,
              'net.peer.port': remotePort,
              'sentry.http.prefetch': isKnownPrefetchRequest(request) || undefined,
              // Old Semantic Conventions attributes for compatibility
              'http.url': fullUrl,
              'http.method': method,
              'http.target': urlObj ? `${urlObj.pathname}${urlObj.search}` : httpTargetWithoutQueryFragment,
              'http.host': host,
              'net.host.name': hostname,
              'http.client_ip': typeof ips === 'string' ? ips.split(',')[0] : undefined,
              'http.user_agent': userAgent,
              'http.scheme': scheme,
              'http.flavor': httpVersion,
              'net.transport': httpVersion?.toUpperCase() === 'QUIC' ? 'ip_udp' : 'ip_tcp',
              ...getRequestContentLengthAttribute(request),
              ...httpHeadersToSpanAttributes(
                normalizedRequest.headers || {},
                client.getOptions().sendDefaultPii ?? false,
              ),
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
                'http.status_text': response.statusMessage?.toUpperCase(),
                'http.response.status_code': response.statusCode,
                'http.status_code': response.statusCode,
                ...httpHeadersToSpanAttributes(
                  headersToDict(response.headers),
                  client?.getOptions().sendDefaultPii ?? false,
                  'response',
                ),
              });
              span.setStatus(status);
              onSpanEnd?.(span, request, response);
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

            // Continue handling the request inside the active span context
            _next();
          },
        );
      };
    },
  });
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

function getRequestContentLengthAttribute(request: HttpIncomingMessage): SpanAttributes {
  const { headers } = request;
  const contentLengthHeader = headers['content-length'];
  const length = contentLengthHeader ? parseInt(String(contentLengthHeader), 10) : -1;
  const encoding = headers['content-encoding'];
  return length >= 0
    ? encoding && encoding !== 'identity'
      ? { 'http.request_content_length': length }
      : { 'http.request_content_length_uncompressed': length }
    : {};
}
