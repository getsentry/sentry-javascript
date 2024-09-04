import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { context, propagation } from '@opentelemetry/api';
import { addBreadcrumb, defineIntegration, getCurrentScope, hasTracingEnabled } from '@sentry/core';
import {
  addOpenTelemetryInstrumentation,
  generateSpanContextForPropagationContext,
  getPropagationContextFromSpan,
} from '@sentry/opentelemetry';
import type { IntegrationFn, SanitizedRequestData } from '@sentry/types';
import { getSanitizedUrlString, logger, parseUrl } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { NODE_MAJOR } from '../nodeVersion';

import type { FetchInstrumentation } from 'opentelemetry-instrumentation-fetch-node';

import { addOriginToSpan } from '../utils/addOriginToSpan';

interface FetchRequest {
  method: string;
  origin: string;
  path: string;
  headers: string | string[];
}

interface FetchResponse {
  headers: Buffer[];
  statusCode: number;
}

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

  async function getInstrumentation(): Promise<FetchInstrumentation | void> {
    // Only add NodeFetch if Node >= 18, as previous versions do not support it
    if (NODE_MAJOR < 18) {
      DEBUG_BUILD && logger.log('NodeFetch is not supported on Node < 18, skipping instrumentation...');
      return;
    }

    try {
      const pkg = await import('opentelemetry-instrumentation-fetch-node');
      const { FetchInstrumentation } = pkg;

      class SentryNodeFetchInstrumentation extends FetchInstrumentation {
        // We extend this method so we have access to request _and_ response for the breadcrumb
        public onHeaders({ request, response }: { request: FetchRequest; response: FetchResponse }): void {
          if (_breadcrumbs) {
            _addRequestBreadcrumb(request, response);
          }

          return super.onHeaders({ request, response });
        }
      }

      return new SentryNodeFetchInstrumentation({
        ignoreRequestHook: (request: FetchRequest) => {
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
        onRequest: ({ span }: { span: Span }) => {
          _updateSpan(span);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } catch (error) {
      // Could not load instrumentation
      DEBUG_BUILD && logger.log('Error while loading NodeFetch instrumentation: \n', error);
    }
  }

  return {
    name: 'NodeFetch',
    setupOnce() {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      getInstrumentation().then(instrumentation => {
        if (instrumentation) {
          addOpenTelemetryInstrumentation(instrumentation);
        }
      });
    },
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

/** Update the span with data we need. */
function _updateSpan(span: Span): void {
  addOriginToSpan(span, 'auto.http.otel.node_fetch');
}

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(request: FetchRequest, response: FetchResponse): void {
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

function getBreadcrumbData(request: FetchRequest): Partial<SanitizedRequestData> {
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
