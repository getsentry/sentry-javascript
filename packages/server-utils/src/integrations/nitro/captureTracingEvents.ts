import { SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE, SENTRY_ORIGIN, SERVER_PORT } from '@sentry/conventions/attributes';
import { HANDLER, HTTP_SERVER, MIDDLEWARE } from '@sentry/conventions/op';
import {
  isObjectLike,
  getActiveSpan,
  getClient,
  getHttpSpanDetailsFromUrlObject,
  getRootSpan,
  GLOBAL_OBJ,
  hasSpanStreamingEnabled,
  httpHeadersToSpanAttributes,
  HTTP_SPAN_NAME_FALLBACK,
  parseStringToURLObject,
  setHttpStatus,
  type Span,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import { bindTracingChannelToSpan, type TracingChannelPayloadWithSpan } from '../../tracing-channel';
import * as diagnosticsChannel from '../../utils/diagnosticsChannel';
import { setHttpServerSpanRouteAttribute } from '../../utils/setHttpServerSpanRouteAttribute';
import type { H3TracingRequestEvent, NitroH3Event, SrvxRequestEvent } from './nitroTypes';

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
  if (isObjectLike(result) && 'status' in result && typeof result.status === 'number') {
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
 * Whether the request already has an `http.server` root span, created by the runtime's own HTTP
 * server instrumentation (Node `http`, `Bun.serve`, `Deno.serve`, Cloudflare's request wrapper).
 */
function hasHttpServerRootSpan(): boolean {
  const activeSpan = getActiveSpan();
  return !!activeSpan && spanToJSON(getRootSpan(activeSpan)).attributes[SENTRY_OP] === HTTP_SERVER;
}

/**
 * The port the srvx server listens on. `options.port` is only the configured one, which is `0` for a
 * random port.
 */
function getServerPort(server: SrvxRequestEvent['server']): number | undefined {
  const url = server.url ? parseStringToURLObject(server.url) : undefined;
  const port = url && 'port' in url ? Number(url.port) : undefined;
  return port || server.options.port || undefined;
}

/**
 * Extracts the parameterized route pattern from the h3 event context.
 */
function getParameterizedRoute(event: NitroH3Event): string | undefined {
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
  // Bail if this is not available
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<H3TracingRequestEvent>('h3.request'),
    data => {
      const method = data.event.req.method?.toUpperCase() || HTTP_SPAN_NAME_FALLBACK;

      // The route lives on the request's `http.server` root span, so the route handler only gets a
      // span that times the handler itself instead of yet another nested `http.server` span.
      if (data.type === 'route' && hasHttpServerRootSpan()) {
        const matchedRoute = data.event.context?.matchedRoute?.route;
        const span = startInactiveSpan({
          name: matchedRoute ? `${method} ${matchedRoute}` : method,
          attributes: {
            [SENTRY_ORIGIN]: 'auto.http.nitro.h3',
            [SENTRY_OP]: HANDLER,
          },
        });

        setParameterizedRouteAttributes(span, data.event);

        return span;
      }

      const parsedUrl = parseStringToURLObject(data.event.url.href);
      const routePattern = getParameterizedRoute(data.event);

      const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(
        parsedUrl,
        'server',
        'auto.http.nitro.h3',
        { method: data.event.req.method },
        routePattern,
      );

      const client = getClient();
      // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
      // Only applies to the http.server span; middleware spans keep their own naming.
      const isUnparameterizedStreamedServerSpan =
        data.type !== 'middleware' &&
        urlAttributes[SENTRY_SEGMENT_NAME_SOURCE] !== 'route' &&
        !!client &&
        hasSpanStreamingEnabled(client);

      const span = startInactiveSpan({
        name: isUnparameterizedStreamedServerSpan ? method : spanName,
        attributes: {
          ...urlAttributes,
          [SENTRY_ORIGIN]: 'auto.http.nitro.h3',
          [SENTRY_OP]: data.type === 'middleware' ? MIDDLEWARE : HTTP_SERVER,
        },
      });

      setParameterizedRouteAttributes(span, data.event);

      return span;
    },
    {
      beforeSpanEnd(span, data) {
        applyResponseStatus(span, data);

        // Update the root span with the parameterized route name. The root span is created before h3
        // resolves the route, so it initially has the raw URL.
        // Note: data.type is always 'middleware' here regardless of handler type, so we rely on
        // getParameterizedRoute() to filter out catch-all routes instead.
        const routePattern = getParameterizedRoute(data.event);
        if (routePattern) {
          setHttpServerSpanRouteAttribute(routePattern);
        }
      },
    },
  );
}

function setupSrvxTracingChannels(): void {
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  // Store the parent span per-request so middleware and fetch share the same parent.
  // WeakMap ensures per-request isolation in concurrent environments and automatic cleanup.
  const requestParentSpans = new WeakMap<SrvxRequestEvent['request'], Span>();

  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<SrvxRequestEvent>('srvx.request'),
    data => {
      // srvx only opens the request's `http.server` span when the runtime has not already created one.
      if (hasHttpServerRootSpan()) {
        return undefined;
      }

      const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
      const client = getClient();
      const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(
        parsedUrl,
        'server',
        'auto.http.nitro.srvx',
        { method: data.request.method },
        undefined,
        client,
      );

      const headerAttributes = client
        ? httpHeadersToSpanAttributes(
            Object.fromEntries(data.request.headers.entries()),
            client.getDataCollectionOptions(),
          )
        : {};

      // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
      // Only applies to the http.server span; middleware spans keep their own naming.
      // h3 renames this span via `setHttpServerSpanRouteAttribute` once it resolves the route.
      const isUnparameterizedStreamedServerSpan =
        !data.middleware &&
        urlAttributes[SENTRY_SEGMENT_NAME_SOURCE] !== 'route' &&
        !!client &&
        hasSpanStreamingEnabled(client);

      return startInactiveSpan({
        name: isUnparameterizedStreamedServerSpan
          ? data.request.method?.toUpperCase() || HTTP_SPAN_NAME_FALLBACK
          : spanName,
        attributes: {
          ...urlAttributes,
          ...headerAttributes,
          [SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SENTRY_OP]: data.middleware ? MIDDLEWARE : HTTP_SERVER,
          [SERVER_PORT]: getServerPort(data.server),
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
    diagnosticsChannel.tracingChannel<SrvxRequestEvent>('srvx.middleware'),
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
          [SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SENTRY_OP]: MIDDLEWARE,
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
function setParameterizedRouteAttributes(span: Span, event: NitroH3Event): void {
  const matchedRoutePath = getParameterizedRoute(event);
  if (!matchedRoutePath) {
    return;
  }

  setHttpServerSpanRouteAttribute(matchedRoutePath);

  const rootSpan = getRootSpan(span);
  if (!rootSpan) {
    return;
  }

  const params = event.context?.params;

  if (isObjectLike(params)) {
    Object.entries(params).forEach(([key, value]) => {
      // Based on this convention: https://getsentry.github.io/sentry-conventions/generated/attributes/url.html#urlpathparameterkey
      rootSpan.setAttributes({
        [`url.path.parameter.${key}`]: String(value),
        [`params.${key}`]: String(value),
      });
    });
  }
}
