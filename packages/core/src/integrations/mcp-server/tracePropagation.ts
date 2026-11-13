/**
 * Trace context propagation through the MCP `params._meta` property bag.
 * @see https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md#context-propagation
 */

import { getClient } from '../../currentScopes';
import { continueTrace } from '../../tracing/trace';
import type { SpanLink } from '../../types/link';
import { isObjectLike } from '../../utils/is';
import { getActiveSpan } from '../../utils/spanUtils';
import { extractTraceparentData, sentryTraceFromTraceparent } from '../../utils/tracing';

function getSentryTraceFromMeta(meta: Record<PropertyKey, unknown>): string | undefined {
  const sentryTrace = meta['sentry-trace'];
  if (typeof sentryTrace === 'string') {
    return sentryTrace;
  }
  // W3C Trace Context is opt-in, the same way `propagateTraceparent` gates sending `traceparent` on HTTP requests.
  const traceparent = meta.traceparent;
  return getClient()?.getOptions().propagateTraceparent && typeof traceparent === 'string'
    ? sentryTraceFromTraceparent(traceparent)
    : undefined;
}

/**
 * Runs `callback` in the trace carried by the message's `params._meta`, so the MCP server span becomes a child of the
 * client span that sent the message. The span that was active when the message arrived (e.g. the HTTP server span of a
 * Streamable HTTP request) is handed to `callback` as a link, because MCP and transport contexts are independent: one
 * HTTP request can carry several MCP messages and one MCP request can be retried over several HTTP requests.
 *
 * Without a valid trace context in `_meta`, `callback` runs in the current context, unchanged.
 */
export function continueMcpTrace<T>(params: unknown, callback: (links: SpanLink[] | undefined) => T): T {
  const meta = isObjectLike(params) && isObjectLike(params._meta) ? params._meta : undefined;
  const sentryTrace = meta ? getSentryTraceFromMeta(meta) : undefined;

  // `continueTrace` starts a fresh trace for a malformed value, which would detach the span from the transport trace
  // it would otherwise have joined.
  if (!meta || !sentryTrace || !extractTraceparentData(sentryTrace)?.traceId) {
    return callback(undefined);
  }

  const ambientSpan = getActiveSpan();
  const links = ambientSpan ? [{ context: ambientSpan.spanContext() }] : undefined;
  const baggage = typeof meta.baggage === 'string' ? meta.baggage : undefined;

  return continueTrace({ sentryTrace, baggage }, () => callback(links));
}
