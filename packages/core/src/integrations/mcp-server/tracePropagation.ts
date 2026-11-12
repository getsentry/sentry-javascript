/**
 * Trace context propagation through the MCP `params._meta` property bag.
 * @see https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md#context-propagation
 */

import { getClient } from '../../currentScopes';
import { continueTrace } from '../../tracing/trace';
import type { SpanLink } from '../../types/link';
import { isObjectLike } from '../../utils/is';
import { getActiveSpan } from '../../utils/spanUtils';
import { getTraceData } from '../../utils/traceData';
import { extractTraceparentData, sentryTraceFromTraceparent } from '../../utils/tracing';
import type { JsonRpcNotification, JsonRpcRequest } from './types';

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

/**
 * Returns a copy of an outgoing request or notification with the active trace context added to `params._meta`, so the
 * receiving side can continue the trace. Messages that already carry trace context are returned unchanged.
 *
 * `traceparent` is always added, independent of the `propagateTraceparent` option: that option guards HTTP requests
 * against CORS failures, which do not apply here, and W3C Trace Context is what non-Sentry MCP peers read.
 */
export function injectMcpTraceContext<M extends JsonRpcRequest | JsonRpcNotification>(message: M): M {
  const meta = message.params?._meta;
  if (
    meta !== undefined &&
    (!isObjectLike(meta) || meta['sentry-trace'] !== undefined || meta.traceparent !== undefined)
  ) {
    return message;
  }

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = getTraceData({ propagateTraceparent: true });
  if (!sentryTrace) {
    return message;
  }

  return {
    ...message,
    params: {
      ...message.params,
      _meta: {
        ...meta,
        'sentry-trace': sentryTrace,
        ...(traceparent && { traceparent }),
        ...(baggage && { baggage }),
      },
    },
  };
}
