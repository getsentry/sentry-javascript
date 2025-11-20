import { ATTR_URL_QUERY, SEMATTRS_HTTP_TARGET } from '@opentelemetry/semantic-conventions';
import { type Span, type SpanAttributes, GLOBAL_OBJ, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { isSentryRequestSpan } from '@sentry/opentelemetry';
import { ATTR_NEXT_SPAN_TYPE } from '../nextSpanAttributes';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../span-attributes-with-logic-attached';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewritesTunnelPath?: string;
};

/**
 * Drops spans for tunnel requests from middleware or fetch instrumentation.
 * This catches both:
 * 1. Requests to the local tunnel route (before rewrite)
 * 2. Requests to Sentry ingest (after rewrite)
 */
export function dropMiddlewareTunnelRequests(span: Span, attrs: SpanAttributes | undefined): void {
  // Only filter middleware spans or HTTP fetch spans
  const isMiddleware = attrs?.[ATTR_NEXT_SPAN_TYPE] === 'Middleware.execute';
  // The fetch span could be originating from rewrites re-writing a tunnel request
  // So we want to filter it out
  const isFetchSpan = attrs?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.http.otel.node_fetch';

  // If the span is not a middleware span or a fetch span, return
  if (!isMiddleware && !isFetchSpan) {
    return;
  }

  // Check if this is either a tunnel route request or a Sentry ingest request
  const isTunnel = isTunnelRouteSpan(attrs || {});
  const isSentry = isSentryRequestSpan(span);

  if (isTunnel || isSentry) {
    // Mark the span to be dropped
    span.setAttribute(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
  }
}

/**
 * Checks if a span's HTTP target matches the tunnel route.
 */
function isTunnelRouteSpan(spanAttributes: Record<string, unknown>): boolean {
  // Don't use process.env here because it will have a different value in the build and runtime
  // We want to use the one in build
  const tunnelPath = globalWithInjectedValues._sentryRewritesTunnelPath || process.env._sentryRewritesTunnelPath;
  if (!tunnelPath) {
    return false;
  }

  // Check both http.target (older) and url.query (newer) attributes
  // eslint-disable-next-line deprecation/deprecation
  const httpTarget = spanAttributes[SEMATTRS_HTTP_TARGET] || spanAttributes[ATTR_URL_QUERY];

  if (typeof httpTarget === 'string') {
    // Extract pathname from the target (e.g., "/tunnel?o=123&p=456" -> "/tunnel")
    const pathname = httpTarget.split('?')[0] || '';

    return pathname.startsWith(tunnelPath);
  }

  return false;
}
