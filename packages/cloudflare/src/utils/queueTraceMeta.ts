import type { SerializedTraceData } from '@sentry/core';
import { extractTraceparentData } from '@sentry/core';

const SENTRY_QUEUE_TRACE_KEY = '__sentry_queue_meta__';

function isQueueTraceCarrier(body: unknown): body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return false;
  }

  // Cloudflare Queues has no message-header API. Only record-like bodies can carry a named field; binary data and
  // other structured-clone values must pass through untouched.
  const prototype = Object.getPrototypeOf(body);
  return prototype === Object.prototype || prototype === null;
}

export function addQueueTraceContext(body: unknown, traceData: SerializedTraceData): unknown {
  if (
    !isQueueTraceCarrier(body) ||
    !traceData['sentry-trace'] ||
    Object.prototype.hasOwnProperty.call(body, SENTRY_QUEUE_TRACE_KEY)
  ) {
    return body;
  }

  // Avoid mutating application-owned values; callers may reuse a payload after enqueueing it.
  return { ...body, [SENTRY_QUEUE_TRACE_KEY]: traceData };
}

export function extractQueueTraceContext(
  body: unknown,
): { traceId: string; spanId: string; sampled: boolean | undefined } | undefined {
  if (!isQueueTraceCarrier(body)) {
    return undefined;
  }

  const traceData = body[SENTRY_QUEUE_TRACE_KEY];
  if (typeof traceData !== 'object' || traceData === null) {
    return undefined;
  }

  const sentryTrace = Reflect.get(traceData, 'sentry-trace');
  if (typeof sentryTrace !== 'string') {
    return undefined;
  }

  const traceparentData = extractTraceparentData(sentryTrace);
  if (!traceparentData?.traceId || !traceparentData.parentSpanId) {
    return undefined;
  }

  // Transport metadata must not leak into domain validation or application contracts.
  delete body.__sentry_queue_meta__;

  return {
    traceId: traceparentData.traceId,
    spanId: traceparentData.parentSpanId,
    sampled: traceparentData.parentSampled,
  };
}
