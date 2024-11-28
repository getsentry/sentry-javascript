import type { UndiciRequest, UndiciResponse } from '@opentelemetry/instrumentation-undici';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { LRUMap, getClient, getTraceData } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, addBreadcrumb, defineIntegration, hasTracingEnabled } from '@sentry/core';
import { getBreadcrumbLogLevelFromHttpStatusCode, getSanitizedUrlString, parseUrl } from '@sentry/core';
import { addOpenTelemetryInstrumentation, shouldPropagateTraceForUrl } from '@sentry/opentelemetry';
import type { IntegrationFn, SanitizedRequestData } from '@sentry/types';

interface NodeFetchOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing fetch requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  const _breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
  const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;

  return {
    name: 'NodeFetch',
    setupOnce() {
      const propagationDecisionMap = new LRUMap<string, boolean>(100);

      const instrumentation = new UndiciInstrumentation({
        requireParentforSpans: false,
        ignoreRequestHook: request => {
          const url = getAbsoluteUrl(request.origin, request.path);
          const shouldIgnore = _ignoreOutgoingRequests && url && _ignoreOutgoingRequests(url);

          if (shouldIgnore) {
            return true;
          }

          // If tracing is disabled, we still want to propagate traces
          // So we do that manually here, matching what the instrumentation does otherwise
          if (!hasTracingEnabled()) {
            const tracePropagationTargets = getClient()?.getOptions().tracePropagationTargets;
            const addedHeaders = shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)
              ? getTraceData()
              : {};

            const requestHeaders = request.headers;
            if (Array.isArray(requestHeaders)) {
              Object.entries(addedHeaders).forEach(headers => requestHeaders.push(...headers));
            } else {
              request.headers += Object.entries(addedHeaders)
                .map(([k, v]) => `${k}: ${v}\r\n`)
                .join('');
            }

            // Prevent starting a span for this request
            return true;
          }

          return false;
        },
        startSpanHook: () => {
          return {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          };
        },
        responseHook: (_, { request, response }) => {
          if (_breadcrumbs) {
            addRequestBreadcrumb(request, response);
          }
        },
      });

      addOpenTelemetryInstrumentation(instrumentation);
    },
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

/** Add a breadcrumb for outgoing requests. */
function addRequestBreadcrumb(request: UndiciRequest, response: UndiciResponse): void {
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

function getBreadcrumbData(request: UndiciRequest): Partial<SanitizedRequestData> {
  try {
    const url = new URL(request.path, request.origin);
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

// Matching the behavior of the base instrumentation
function getAbsoluteUrl(origin: string, path: string = '/'): string {
  const url = `${origin}`;

  if (url.endsWith('/') && path.startsWith('/')) {
    return `${url}${path.slice(1)}`;
  }

  if (!url.endsWith('/') && !path.startsWith('/')) {
    return `${url}/${path.slice(1)}`;
  }

  return `${url}${path}`;
}
