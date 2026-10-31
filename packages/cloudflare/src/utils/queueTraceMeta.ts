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

  // Cloudflare rejects messages over 128 KB (https://developers.cloudflare.com/queues/platform/limits/),
  // and the field adds about 80 bytes, so a payload right under the limit can start failing to send.
  // Span links only need `sentry-trace`, so baggage would only cost more of that budget. Copy instead
  // of mutating, because callers may reuse a payload after enqueueing it.
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

  // The key is reserved transport metadata, so strip it even if its value is not a valid trace.
  // Unlike `delete`, this returns false instead of throwing on frozen bodies, which keep the field.
  Reflect.deleteProperty(body, SENTRY_QUEUE_TRACE_KEY);

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
