import { trace } from '@opentelemetry/api';
import { context, propagation } from '@opentelemetry/api';
import type { UndiciRequest, UndiciResponse } from '@opentelemetry/instrumentation-undici';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import { addBreadcrumb, defineIntegration, getCurrentScope, hasTracingEnabled } from '@sentry/core';
import {
  addOpenTelemetryInstrumentation,
  generateSpanContextForPropagationContext,
  getPropagationContextFromSpan,
} from '@sentry/opentelemetry';
import type { IntegrationFn, SanitizedRequestData } from '@sentry/types';
import { getSanitizedUrlString, parseUrl } from '@sentry/utils';

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
      const instrumentation = new UndiciInstrumentation({
        ignoreRequestHook: request => {
          const url = getAbsoluteUrl(request.origin, request.path);
          const tracingDisabled = !hasTracingEnabled();
          const shouldIgnore = _ignoreOutgoingRequests && url && _ignoreOutgoingRequests(url);

          if (shouldIgnore) {
            return true;
          }

          // If tracing is disabled, we still want to propagate traces
          // So we do that manually here, matching what the instrumentation does otherwise
          if (tracingDisabled) {
            const ctx = context.active();
            const addedHeaders: Record<string, string> = {};

            // We generate a virtual span context from the active one,
            // Where we attach the URL to the trace state, so the propagator can pick it up
            const activeSpan = trace.getSpan(ctx);
            const propagationContext = activeSpan
              ? getPropagationContextFromSpan(activeSpan)
              : getCurrentScope().getPropagationContext();

            const spanContext = generateSpanContextForPropagationContext(propagationContext);
            // We know that in practice we'll _always_ haven a traceState here
            spanContext.traceState = spanContext.traceState?.set('sentry.url', url);
            const ctxWithUrlTraceState = trace.setSpanContext(ctx, spanContext);

            propagation.inject(ctxWithUrlTraceState, addedHeaders);

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
        startSpanHook: request => {
          const url = getAbsoluteUrl(request.origin, request.path);

          return {
            [SEMATTRS_HTTP_URL]: url,
            SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'auto.http.otel.node_fetch',
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

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: response.statusCode,
        ...data,
      },
      type: 'http',
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

  if (origin.endsWith('/') && path.startsWith('/')) {
    return `${url}${path.slice(1)}`;
  }

  if (!origin.endsWith('/') && !path.startsWith('/')) {
    return `${url}/${path.slice(1)}`;
  }

  return `${url}${path}`;
}
