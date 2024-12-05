import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import type { IntegrationFn } from '@sentry/core';
import {
  LRUMap,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  defineIntegration,
  getClient,
  getTraceData,
  hasTracingEnabled,
} from '@sentry/core';
import { shouldPropagateTraceForUrl } from '@sentry/opentelemetry';

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
      });

      registerInstrumentations({ instrumentations: [instrumentation] });
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
