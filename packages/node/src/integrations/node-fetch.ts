import { context, propagation, trace } from '@opentelemetry/api';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, getCurrentScope, hasTracingEnabled } from '@sentry/core';
import {
  addOpenTelemetryInstrumentation,
  generateSpanContextForPropagationContext,
  getPropagationContextFromSpan,
} from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';
interface NodeFetchOptions {
  /**
   * @deprecated Use `fetchBreadcrumbs` init option instead.
   * ```js
   * Sentry.init({
   *   dsn: '__DSN__',
   *   fetchBreadcrumbs: false,
   * })
   * ```
   *
   * Whether breadcrumbs should be recorded for requests.
   *
   * Defaults to `true`
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing fetch requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;

  return {
    name: 'NodeFetch',
    setupOnce() {
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
        startSpanHook: () => {
          return {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
          };
        },
      });

      addOpenTelemetryInstrumentation(instrumentation);
    },
    // eslint-disable-next-line deprecation/deprecation
    breadcrumbsDisabled: options.breadcrumbs === false,
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

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
