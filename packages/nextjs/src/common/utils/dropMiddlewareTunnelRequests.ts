import { HTTP_TARGET, URL_FULL, URL_PATH, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { Client, ClientOptions, RawAttributes } from '@sentry/core';
import {
  _INTERNAL_normalizeTunnelBasePath as normalizeTunnelBasePath,
  escapeStringForRegex,
  getClient,
  isSentryRequestUrl,
  type Span,
} from '@sentry/core';
import { _INTERNAL_getServedTunnel as getServedTunnel } from '@sentry/core/server';
import { ATTR_NEXT_ROUTE, ATTR_NEXT_SPAN_TYPE } from '../nextSpanAttributes';
import {
  getTunnelRouteRequestPattern,
  isPathnameUnderSentryTunnelRoute,
  TUNNEL_ROUTE_HANDLER_PATH,
} from './tunnelPathnameMatch';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../span-attributes-with-logic-attached';

/**
 * The paths of the managed tunnel the client serves, with the `basePath`: the ones derived from the DSNs, or the fixed
 * one.
 */
function getServedTunnelPaths(client: Client | undefined = getClient()): string[] {
  const servedTunnel = getServedTunnel(client);
  if (!servedTunnel) {
    return [];
  }

  const basePath = normalizeTunnelBasePath(servedTunnel.basePath);

  return servedTunnel.paths.map(path => `${basePath}${path}`);
}

/**
 * Drops spans for tunnel requests from middleware, fetch instrumentation, or BaseServer.handleRequest.
 * This catches:
 * 1. Requests to the local tunnel route (before rewrite) via middleware or BaseServer.handleRequest
 * 2. Requests to Sentry ingest (after rewrite) via fetch spans
 */
export function dropMiddlewareTunnelRequests(
  span: Span,
  attrs: RawAttributes<Record<string, unknown>> | undefined,
): void {
  // When the user brings their own OTel setup (enableOpenTelemetrySetup: false), we should not
  // mutate their spans with Sentry-internal attributes as it pollutes their tracing backends.
  if (
    (getClient()?.getOptions() as { enableOpenTelemetrySetup?: boolean } | undefined)?.enableOpenTelemetrySetup ===
    false
  ) {
    return;
  }

  // Only filter middleware spans, HTTP fetch spans, or BaseServer.handleRequest spans. Since Next.js 16.4.3, a proxy
  // invoked separately from the render runs under a `Next.request` root span, which has to be dropped too.
  const isMiddleware =
    attrs?.[ATTR_NEXT_SPAN_TYPE] === 'Middleware.execute' || attrs?.[ATTR_NEXT_SPAN_TYPE] === 'Next.request';
  // The fetch span could be originating from rewrites re-writing a tunnel request
  // So we want to filter it out
  const isFetchSpan = attrs?.[SENTRY_ORIGIN] === 'auto.http.node_fetch';
  const isBaseServerHandleRequest = attrs?.[ATTR_NEXT_SPAN_TYPE] === 'BaseServer.handleRequest';

  // If the span is not a middleware span, fetch span, or BaseServer.handleRequest span, return
  if (!isMiddleware && !isFetchSpan && !isBaseServerHandleRequest) {
    return;
  }

  // Check if this is either a tunnel route request or a Sentry ingest request
  const isTunnel = isTunnelRouteSpan(attrs || {});
  const isSentry = isSentryRequestSpan(attrs || {});

  if (isTunnel || isSentry) {
    // Mark the span to be dropped
    span.setAttribute(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
  }
}

function isSentryRequestSpan(attrs: RawAttributes<Record<string, unknown>>): boolean {
  const httpUrl = attrs[URL_FULL];

  if (!httpUrl) {
    return false;
  }

  return isSentryRequestUrl(httpUrl.toString(), getClient());
}
/**
 * Checks if a span's HTTP target matches the tunnel route.
 */
export function isTunnelRouteSpan(spanAttributes: Record<string, unknown>): boolean {
  const tunnelPaths = getServedTunnelPaths();
  if (!tunnelPaths.length) {
    return false;
  }

  // `http.target` is only read for spans from a user's own OpenTelemetry instrumentation, which
  // still emits the old semantic conventions; the SDK sets `url.path`.
  // eslint-disable-next-line typescript/no-deprecated
  const target = spanAttributes[URL_PATH] ?? spanAttributes[HTTP_TARGET];

  if (typeof target === 'string') {
    // Extract pathname from the target (e.g., "/tunnel?o=123&p=456" -> "/tunnel")
    const pathname = target.split('?')[0] || '';

    return tunnelPaths.some(tunnelPath => isPathnameUnderSentryTunnelRoute(pathname, tunnelPath));
  }

  return false;
}

/**
 * Returns `ignoreSpans` entries for the spans of incoming requests to the tunnel the client serves. Call it after
 * `init`, which sets up the served tunnel.
 *
 * Span streaming checks `ignoreSpans` at span start, before `dropMiddlewareTunnelRequests` runs. Next.js sets only
 * `http.target` then, which the `url.path` filters of the managed tunnel don't read. The entries match only Next.js
 * request spans, so other spans with the same path are kept.
 */
export function getTunnelRouteIgnoreSpans(client: Client | undefined): NonNullable<ClientOptions['ignoreSpans']> {
  const tunnelPaths = getServedTunnelPaths(client);
  if (!tunnelPaths.length) {
    return [];
  }

  return [
    {
      attributes: {
        // Since Next.js 16.4.3, a proxy invoked separately from the render runs under a `Next.request` root span.
        [ATTR_NEXT_SPAN_TYPE]: /^(?:BaseServer\.handleRequest|Middleware\.execute|Next\.request)$/,
        // Next.js sets only `http.target` at span start.
        // eslint-disable-next-line typescript/no-deprecated
        [HTTP_TARGET]: getTunnelRouteRequestPattern(tunnelPaths),
      },
    },
    {
      // On edge, the root span of a route handler has only `next.route`, with a `/route` suffix before Next.js 16.
      attributes: {
        [ATTR_NEXT_SPAN_TYPE]: /^AppRouteRouteHandlers\.runHandler$/,
        [ATTR_NEXT_ROUTE]: new RegExp(`^${escapeStringForRegex(TUNNEL_ROUTE_HANDLER_PATH)}(?:/route)?$`),
      },
    },
  ];
}
