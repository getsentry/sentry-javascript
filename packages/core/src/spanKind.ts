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

// Reverse of SPAN_KIND (value → name), for the `otel.kind` attribute. The numeric keys come from
// SPAN_KIND so they stay in sync; `satisfies` ensures every kind has a name.
const SPAN_KIND_NAME = {
  [SPAN_KIND.INTERNAL]: 'INTERNAL',
  [SPAN_KIND.SERVER]: 'SERVER',
  [SPAN_KIND.CLIENT]: 'CLIENT',
  [SPAN_KIND.PRODUCER]: 'PRODUCER',
  [SPAN_KIND.CONSUMER]: 'CONSUMER',
} as const satisfies Record<SpanKindValue, string>;

/**
 * Resolve the string name of a span kind value (e.g. `1` → `'SERVER'`), mirroring the reverse
 * mapping of OpenTelemetry's `SpanKind` enum. Used for the `otel.kind` span attribute, so SDK
 * code doesn't need to import `@opentelemetry/api` just for that reverse lookup.
 */
export function spanKindToName(kind: number): (typeof SPAN_KIND_NAME)[SpanKindValue] | undefined {
  return SPAN_KIND_NAME[kind as SpanKindValue];
}
