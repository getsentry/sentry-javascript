import type { SerializedStreamedSpan } from '@sentry/core';
import { getSpanOp, waitForStreamedSpan } from './event-proxy-server';

type SpanMatcher = (span: SerializedStreamedSpan) => boolean;

/**
 * Matches an `http.server` span whose `url.path` equals or matches `path`.
 */
export function isServerSpanAt(path: string | RegExp): SpanMatcher {
  return span => {
    const urlPath = String(span.attributes['url.path']?.value ?? '');

    return getSpanOp(span) === 'http.server' && (typeof path === 'string' ? urlPath === path : path.test(urlPath));
  };
}

/**
 * Starts listening for a span of a tunnel request. Call it before the tunnel traffic, then call the returned function
 * with a regular request made after it. Spans flush in order, so it resolves to `'tunnel'` if the tunnel request
 * created a span, and to `'anchor'` otherwise, without waiting on a timeout.
 */
export function watchForTunnelSpan(
  proxyServerName: string,
  isTunnelSpan: SpanMatcher,
): (isAnchorSpan: SpanMatcher, requestAnchor: () => Promise<unknown>) => Promise<'tunnel' | 'anchor'> {
  const tunnelSpanPromise = waitForStreamedSpan(proxyServerName, isTunnelSpan);

  return async (isAnchorSpan, requestAnchor) => {
    const anchorSpanPromise = waitForStreamedSpan(proxyServerName, isAnchorSpan);
    await requestAnchor();

    return Promise.race([
      tunnelSpanPromise.then(() => 'tunnel' as const),
      anchorSpanPromise.then(() => 'anchor' as const),
    ]);
  };
}

/**
 * An envelope with an empty client report, which Sentry accepts without creating anything.
 */
export function makeClientReportEnvelope(dsn: string): string {
  return `${JSON.stringify({ dsn, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'client_report' })}\n${JSON.stringify({ timestamp: Date.now() / 1000, discarded_events: [] })}\n`;
}
