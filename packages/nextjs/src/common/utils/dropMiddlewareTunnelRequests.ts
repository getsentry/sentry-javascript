import { HTTP_TARGET, URL_FULL, URL_PATH, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { ClientOptions, RawAttributes } from '@sentry/core';
import { escapeStringForRegex, getClient, GLOBAL_OBJ, isSentryRequestUrl, type Span } from '@sentry/core';
import { ATTR_NEXT_ROUTE, ATTR_NEXT_SPAN_TYPE } from '../nextSpanAttributes';
import {
  getTunnelRouteRequestPattern,
  isPathnameUnderSentryTunnelRoute,
  TUNNEL_ROUTE_HANDLER_PATH,
  type TunnelRouteMode,
} from './tunnelPathnameMatch';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../span-attributes-with-logic-attached';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewritesTunnelPath?: string;
  _sentryTunnelRouteMode?: TunnelRouteMode;
};

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

  // Only filter middleware spans, HTTP fetch spans, or BaseServer.handleRequest spans
  const isMiddleware = attrs?.[ATTR_NEXT_SPAN_TYPE] === 'Middleware.execute';
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
  const tunnelPath = globalWithInjectedValues._sentryRewritesTunnelPath || process.env._sentryRewritesTunnelPath;
  if (!tunnelPath) {
    return false;
  }

  // `http.target` is only read for spans from a user's own OpenTelemetry instrumentation, which
  // still emits the old semantic conventions; the SDK sets `url.path`.
  // eslint-disable-next-line typescript/no-deprecated
  const target = spanAttributes[URL_PATH] ?? spanAttributes[HTTP_TARGET];

  if (typeof target === 'string') {
    // Extract pathname from the target (e.g., "/tunnel?o=123&p=456" -> "/tunnel")
    const pathname = target.split('?')[0] || '';

    return isPathnameUnderSentryTunnelRoute(pathname, tunnelPath);
  }

  return false;
}

/**
 * Returns `ignoreSpans` entries for the spans of incoming tunnel requests.
 *
 * Span streaming checks `ignoreSpans` at span start, before `dropMiddlewareTunnelRequests` runs. The entries match only
 * Next.js request spans, so other spans with the same path are kept.
 */
export function getTunnelRouteIgnoreSpans(): NonNullable<ClientOptions['ignoreSpans']> {
  const tunnelPath = globalWithInjectedValues._sentryRewritesTunnelPath || process.env._sentryRewritesTunnelPath;
  if (!tunnelPath) {
    return [];
  }

  const tunnelRouteMode =
    (globalWithInjectedValues._sentryTunnelRouteMode || process.env._sentryTunnelRouteMode) === 'handler'
      ? 'handler'
      : 'rewrite';
  const tunnelRequestIgnoreSpan = {
    attributes: {
      [ATTR_NEXT_SPAN_TYPE]: /^(?:BaseServer\.handleRequest|Middleware\.execute)$/,
      // Next.js sets only `http.target` at span start.
      // eslint-disable-next-line typescript/no-deprecated
      [HTTP_TARGET]: getTunnelRouteRequestPattern(tunnelPath, tunnelRouteMode),
    },
  };

  if (tunnelRouteMode !== 'handler') {
    return [tunnelRequestIgnoreSpan];
  }

  // On edge, the root span of a route handler has only `next.route`, with a `/route` suffix before Next.js 16.
  const tunnelRouteHandlerIgnoreSpan = {
    attributes: {
      [ATTR_NEXT_SPAN_TYPE]: /^AppRouteRouteHandlers\.runHandler$/,
      [ATTR_NEXT_ROUTE]: new RegExp(`^${escapeStringForRegex(TUNNEL_ROUTE_HANDLER_PATH)}(?:/route)?$`),
    },
  };
  return [tunnelRequestIgnoreSpan, tunnelRouteHandlerIgnoreSpan];
}
