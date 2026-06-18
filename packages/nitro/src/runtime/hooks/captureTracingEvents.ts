import { tracingChannel } from 'node:diagnostics_channel';
import {
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
  startInactiveSpan,
  updateSpanName,
} from '@sentry/core';
import { bindTracingChannelToSpan, type TracingChannelPayloadWithSpan } from '@sentry/server-utils';
import type { TracingRequestEvent as H3TracingRequestEvent } from 'h3/tracing';
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

/** Applies the HTTP status from the traced handler's result to the span, when present. */
function applyResponseStatus(span: Span, data: TracingChannelPayloadWithSpan<{ result?: unknown }>): void {
  const statusCode = getResponseStatusCode(data.result);
  if (statusCode !== undefined) {
    setHttpStatus(span, statusCode);
  }
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
  const { channel: h3Channel } = bindTracingChannelToSpan(
    tracingChannel<H3TracingRequestEvent>('h3.request'),
    data => {
      const parsedUrl = parseStringToURLObject(data.event.url.href);
      const routePattern = getParameterizedRoute(data.event);

      const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(
        parsedUrl,
        'server',
        'auto.http.nitro.h3',
        { method: data.event.req.method },
        routePattern,
      );

      const span = startInactiveSpan({
        name: spanName,
        attributes: {
          ...urlAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.h3',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data?.type === 'middleware' ? 'middleware.nitro' : 'http.server',
        },
      });

      setParameterizedRouteAttributes(span, data.event);

      return span;
    },
    {
      beforeSpanEnd(span, data) {
        applyResponseStatus(span, data);

        // Update the root span (srvx transaction) with the parameterized route name.
        // The srvx span is created before h3 resolves the route, so it initially has the raw URL.
        // Note: data.type is always 'middleware' here regardless of handler type, so we rely on
        // getParameterizedRoute() to filter out catch-all routes instead.
        const rootSpan = getRootSpan(span);
        if (rootSpan && rootSpan !== span) {
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
    },
  );

  h3Channel.subscribe({
    start: (data: H3TracingRequestEvent) => {
      setServerTimingHeaders(data.event);
    },
  });
}

function setupSrvxTracingChannels(): void {
  // Store the parent span per-request so middleware and fetch share the same parent.
  // WeakMap ensures per-request isolation in concurrent environments and automatic cleanup.
  const requestParentSpans = new WeakMap<Request, Span>();

  bindTracingChannelToSpan(
    tracingChannel<SrvxRequestEvent>('srvx.request'),
    data => {
      const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
      const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', 'auto.http.nitro.srvx', {
        method: data.request.method,
      });

      const headerAttributes = httpHeadersToSpanAttributes(
        Object.fromEntries(data.request.headers.entries()),
        getClient()?.getDataCollectionOptions() ?? false,
      );

      return startInactiveSpan({
        name: spanName,
        attributes: {
          ...urlAttributes,
          ...headerAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data.middleware ? 'middleware.nitro' : 'http.server',
          'server.port': data.server.options.port,
        },
        // Use the same parent span as middleware to make them siblings
        parentSpan: requestParentSpans.get(data.request) || undefined,
      });
    },
    {
      beforeSpanEnd(span, data) {
        applyResponseStatus(span, data);

        // Clean up parent span reference after the fetch handler completes (success or error).
        requestParentSpans.delete(data.request);
      },
    },
  );

  bindTracingChannelToSpan(
    tracingChannel<SrvxRequestEvent>('srvx.middleware'),
    data => {
      // For the first middleware, capture the current parent span per-request
      if (data.middleware?.index === 0) {
        const activeSpan = getActiveSpan();
        if (activeSpan) {
          requestParentSpans.set(data.request, activeSpan);
        }
      }

      const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
      const [, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', 'auto.http.nitro.srvx', {
        method: data.request.method,
      });

      // Create span as a child of the original parent, not the previous middleware
      return startInactiveSpan({
        name: `${data.middleware?.handler.name ?? 'unknown'} - ${data.request.method} ${data.request._url?.pathname}`,
        attributes: {
          ...urlAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nitro',
        },
        parentSpan: requestParentSpans.get(data.request) || undefined,
      });
    },
    {
      beforeSpanEnd(span, data) {
        applyResponseStatus(span, data);
      },
    },
  );
}

/**
 * Sets the parameterized route attributes on the span.
 */
function setParameterizedRouteAttributes(span: Span, event: H3TracingRequestEvent['event']): void {
  const rootSpan = getRootSpan(span);
  if (!rootSpan) {
    return;
  }

  const matchedRoutePath = getParameterizedRoute(event);
  if (!matchedRoutePath) {
    return;
  }

  rootSpan.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
    'http.route': matchedRoutePath,
  });

  const params = event.context?.params;

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      // Based on this convention: https://getsentry.github.io/sentry-conventions/generated/attributes/url.html#urlpathparameterkey
      rootSpan.setAttributes({
        [`url.path.parameter.${key}`]: String(value),
        [`params.${key}`]: String(value),
      });
    });
  }
}
