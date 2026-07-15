import { extractTraceparentData } from '@sentry/core';

const SENTRY_QUEUE_TRACE_KEY = '__sentry_queue_trace__';

function isQueueTraceCarrier(body: unknown): body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return false;
  }

  // Cloudflare Queues has no message-header API. Only record-like bodies can carry a named field; binary data and
  // other structured-clone values must pass through untouched.
  const prototype = Object.getPrototypeOf(body);
  return prototype === Object.prototype || prototype === null;
}

export function addQueueTraceContext(body: unknown, sentryTrace: string | undefined): unknown {
  if (
    !isQueueTraceCarrier(body) ||
    !sentryTrace ||
    Object.prototype.hasOwnProperty.call(body, SENTRY_QUEUE_TRACE_KEY)
  ) {
    return body;
  }

  // Queue messages are capped at 128 KB, but size is not the main reason to keep this minimal: span links only need
  // sentry-trace, so baggage would be unused even when typical JSON payloads have ample headroom.
  // Avoid mutating application-owned values; callers may reuse a payload after enqueueing it.
  return { ...body, [SENTRY_QUEUE_TRACE_KEY]: sentryTrace };
}

export function extractQueueTraceContext(
  body: unknown,
): { traceId: string; spanId: string; sampled: boolean | undefined } | undefined {
  if (!isQueueTraceCarrier(body)) {
    return undefined;
  }

  if (!Object.prototype.hasOwnProperty.call(body, SENTRY_QUEUE_TRACE_KEY)) {
    return undefined;
  }

  const sentryTrace = body[SENTRY_QUEUE_TRACE_KEY];

  // Once propagation is enabled this key is reserved transport metadata, even if its value was corrupted in transit.
  delete body.__sentry_queue_trace__;

  if (typeof sentryTrace !== 'string') {
    return undefined;
  }

  const traceparentData = extractTraceparentData(sentryTrace);
  if (!traceparentData?.traceId || !traceparentData.parentSpanId) {
    return undefined;
  }

  return {
    traceId: traceparentData.traceId,
    spanId: traceparentData.parentSpanId,
    sampled: traceparentData.parentSampled,
  };
}
