/**
 * The kind of a span, mirroring OpenTelemetry's `SpanKind` enum values.
 *
 * Exported as a plain const object so SDK code can set a span's kind without
 * importing `@opentelemetry/api` just for the enum. The numeric values must
 * stay in sync with OpenTelemetry's `SpanKind` since they are passed through to
 * the underlying OTel span and sampler.
 */
export const SPAN_KIND = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4,
} as const;

export type SpanKindValue = (typeof SPAN_KIND)[keyof typeof SPAN_KIND];
