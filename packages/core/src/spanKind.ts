export type SpanKindNumber = 0 | 1 | 2 | 3 | 4;
export type SpanKind = 'server' | 'client' | 'producer' | 'consumer';

/**
 * Map of otel span kind numbers to span kind names.
 */
const SPAN_KIND_NUMBER_TO_NAME = {
  [0]: undefined,
  [1]: 'server',
  [2]: 'client',
  [3]: 'producer',
  [4]: 'consumer',
} as const satisfies Record<SpanKindNumber, SpanKind | undefined>;

/**
 * Resolve the string name of a span kind value (e.g. `1` → `'SERVER'`), mirroring the reverse
 * mapping of OpenTelemetry's `SpanKind` enum. Used for the `otel.kind` span attribute, so SDK
 * code doesn't need to import `@opentelemetry/api` just for that reverse lookup.
 */
export function spanKindToName(kind: number): SpanKind | undefined {
  return SPAN_KIND_NUMBER_TO_NAME[kind as SpanKindNumber];
}
