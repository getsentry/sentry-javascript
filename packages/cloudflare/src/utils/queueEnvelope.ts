/**
 * Trace-context envelope for Cloudflare Queue messages.
 *
 * Cloudflare Queue messages have only `body` and `contentType` — no header
 * channel — so when `enableQueueTracePropagation` is on we wrap the body in
 * a small envelope that carries the producer span's trace_id and span_id.
 * The consumer detects the envelope, transparently unwraps the body, and
 * attaches a span Link from its `process` span to the producer span.
 *
 * Only object-shaped bodies are wrapped; strings, ArrayBuffers, and typed
 * arrays are sent unchanged. Non-envelope messages from non-instrumented
 * producers are passed through with no link.
 */

export interface QueueEnvelopeMeta {
  /** Hex-encoded 32-char trace id of the producer span. */
  trace_id: string;
  /** Hex-encoded 16-char span id of the producer span. */
  span_id: string;
  /** Whether the producer span was sampled. */
  sampled: boolean;
}

export interface QueueEnvelope<T = unknown> {
  __sentry_v1: QueueEnvelopeMeta;
  body: T;
}

/**
 * Returns true when `body` is a plain object that we can safely wrap with a
 * trace-context envelope. Non-objects, arrays, ArrayBuffers, and typed arrays
 * are skipped — wrapping them would require recipients to know about the
 * envelope, breaking interop with non-instrumented consumers.
 */
export function isWrappableBody(body: unknown): body is Record<string, unknown> {
  return (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body)
  );
}

/**
 * Wraps a message body in a trace-context envelope. Caller must have already
 * verified the body via {@link isWrappableBody}.
 */
export function wrapBodyWithTraceContext<T>(body: T, meta: QueueEnvelopeMeta): QueueEnvelope<T> {
  return { __sentry_v1: meta, body };
}

/**
 * Returns the trace-context envelope embedded in `body`, or `null` if `body`
 * is not an envelope.
 */
export function readQueueEnvelope(body: unknown): QueueEnvelope | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const meta = (body as Record<string, unknown>).__sentry_v1 as Partial<QueueEnvelopeMeta> | undefined;
  if (
    meta === null ||
    typeof meta !== 'object' ||
    typeof meta.trace_id !== 'string' ||
    typeof meta.span_id !== 'string'
  ) {
    return null;
  }
  return body as QueueEnvelope;
}
