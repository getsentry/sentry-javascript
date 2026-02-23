import {
  captureException,
  getActiveSpan,
  getClient,
  getHttpSpanDetailsFromUrlObject,
  getRootSpan,
  GLOBAL_OBJ,
  httpHeadersToSpanAttributes,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  type Span,
  SPAN_STATUS_ERROR,
  startSpanManual,
  updateSpanName,
} from '@sentry/core';
import type { TracingRequestEvent as H3TracingRequestEvent } from 'h3/tracing';
import { tracingChannel } from 'otel-tracing-channel';
import type { RequestEvent as SrvxRequestEvent } from 'srvx/tracing';
import { setServerTimingHeaders } from './setServerTimingHeaders';

/**
 * Global object with the trace channels
 */
const globalWithTraceChannels = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __SENTRY_NITRO_HTTP_CHANNELS_INSTRUMENTED__: boolean;
};

/**
 * Captures tracing events emitted by Nitro tracing channels.
 */
export function captureTracingEvents(): void {
  if (globalWithTraceChannels.__SENTRY_NITRO_HTTP_CHANNELS_INSTRUMENTED__) {
    return;
  }

  setupH3TracingChannels();
  setupSrvxTracingChannels();
  globalWithTraceChannels.__SENTRY_NITRO_HTTP_CHANNELS_INSTRUMENTED__ = true;
}

/**
 * No-op function to satisfy the tracing channel subscribe callbacks
 */
const NOOP = (): void => {};

/**
 * Extracts the HTTP status code from a tracing channel result.
 * The result is the return value of the traced handler, which is a Response for srvx
 * and may or may not be a Response for h3.
 */
function getResponseStatusCode(result: unknown): number | undefined {
  if (result && typeof result === 'object' && 'status' in result && typeof result.status === 'number') {
    return result.status;
  }
  return undefined;
}

function onTraceEnd(data: { span?: Span; result?: unknown }): void {
  const statusCode = getResponseStatusCode(data.result);
  if (data.span && statusCode !== undefined) {
    setHttpStatus(data.span, statusCode);
  }

  data.span?.end();
}

function onTraceError(data: { span?: Span; error: unknown }): void {
  captureException(data.error);
  data.span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  data.span?.end();
}

/**
 * Extracts the parameterized route pattern from the h3 event context.
 */
function getParameterizedRoute(event: H3TracingRequestEvent['event']): string | undefined {
  const matchedRoute = event.context?.matchedRoute;
  if (!matchedRoute) {
    return undefined;
  }

  const routePath = matchedRoute.route;

  // Skip catch-all routes as they're not useful for transaction grouping
  if (!routePath || routePath === '/**') {
    return undefined;
  }

  return routePath;
}

function setupH3TracingChannels(): void {
  const h3Channel = tracingChannel<H3TracingRequestEvent>('h3.request', data => {
    const parsedUrl = parseStringToURLObject(data.event.url.href);
    const routePattern = getParameterizedRoute(data.event);

    const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(
      parsedUrl,
      'server',
      'auto.http.nitro.h3',
      { method: data.event.req.method },
      routePattern,
    );

    return startSpanManual(
      {
        name: spanName,
        attributes: {
          ...urlAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.h3',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data?.type === 'middleware' ? 'middleware.nitro' : 'http.server',
        },
      },
      s => s,
    );
  });

  h3Channel.subscribe({
    start: (data: H3TracingRequestEvent) => {
      setServerTimingHeaders(data.event);
    },
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: (data: H3TracingRequestEvent & { span?: Span; result?: unknown }) => {
      onTraceEnd(data);

      if (!data.span) {
        return;
      }

      // Update the root span (srvx transaction) with the parameterized route name.
      // The srvx span is created before h3 resolves the route, so it initially has the raw URL.
      // Note: data.type is always 'middleware' in asyncEnd regardless of handler type,
      // so we rely on getParameterizedRoute() to filter out catch-all routes instead.
      const rootSpan = getRootSpan(data.span);
      if (rootSpan && rootSpan !== data.span) {
        const routePattern = getParameterizedRoute(data.event);
        if (routePattern) {
          const method = data.event.req.method || 'GET';
          updateSpanName(rootSpan, `${method} ${routePattern}`);
          rootSpan.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'http.route': routePattern,
          });
        }
      }
    },
    error: onTraceError,
  });
}

function setupSrvxTracingChannels(): void {
  // Store the parent span for all middleware and fetch to share
  // This ensures they all appear as siblings in the trace
  let requestParentSpan: Span | null = null;

  const fetchChannel = tracingChannel<SrvxRequestEvent>('srvx.request', data => {
    const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
    const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', 'auto.http.nitro.srvx', {
      method: data.request.method,
    });

    const sendDefaultPii = getClient()?.getOptions().sendDefaultPii ?? false;
    const headerAttributes = httpHeadersToSpanAttributes(
      Object.fromEntries(data.request.headers.entries()),
      sendDefaultPii,
    );

    return startSpanManual(
      {
        name: spanName,
        attributes: {
          ...urlAttributes,
          ...headerAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data.middleware ? 'middleware.nitro' : 'http.server',
          'server.port': data.server.options.port,
        },
        // Use the same parent span as middleware to make them siblings
        parentSpan: requestParentSpan || undefined,
      },
      span => span,
    );
  });

  // Subscribe to events (span already created in bindStore)
  fetchChannel.subscribe({
    start: () => {},
    asyncStart: () => {},
    end: () => {},
    asyncEnd: data => {
      onTraceEnd(data);

      // Reset parent span reference after the fetch handler completes
      // This ensures each request gets a fresh parent span capture
      requestParentSpan = null;
    },
    error: data => {
      onTraceError(data);
      // Reset parent span reference on error too
      requestParentSpan = null;
    },
  });

  const middlewareChannel = tracingChannel<SrvxRequestEvent>('srvx.middleware', data => {
    // For the first middleware, capture the current parent span
    if (data.middleware?.index === 0) {
      requestParentSpan = getActiveSpan() || null;
    }

    const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
    const [, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', 'auto.http.nitro.srvx', {
      method: data.request.method,
    });

    // Create span as a child of the original parent, not the previous middleware
    return startSpanManual(
      {
        name: `${data.middleware?.handler.name ?? 'unknown'} - ${data.request.method} ${data.request._url?.pathname}`,
        attributes: {
          ...urlAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nitro',
        },
        parentSpan: requestParentSpan || undefined,
      },
      span => span,
    );
  });

  // Subscribe to events (span already created in bindStore)
  middlewareChannel.subscribe({
    start: () => {},
    asyncStart: () => {},
    end: () => {},
    asyncEnd: onTraceEnd,
    error: onTraceError,
  });
}
