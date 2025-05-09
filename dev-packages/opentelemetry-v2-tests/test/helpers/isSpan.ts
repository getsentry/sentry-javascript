import type { Span } from '@opentelemetry/api';
import { INVALID_TRACEID, INVALID_SPANID, type SpanContext } from '@opentelemetry/api';

export const isSpan = (value: unknown): value is Span => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'spanContext' in value &&
    (value.spanContext as () => SpanContext)().traceId !== INVALID_TRACEID &&
    (value.spanContext as () => SpanContext)().spanId !== INVALID_SPANID
  );
};
