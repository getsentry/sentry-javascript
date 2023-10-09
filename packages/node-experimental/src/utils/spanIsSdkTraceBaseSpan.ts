import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { Span as SdkTraceBaseSpan } from '@opentelemetry/sdk-trace-base';

/**
 * If the span is a SDK trace base span, which has some additional fields.
 */
export function spanIsSdkTraceBaseSpan(span: Span | ReadableSpan): span is SdkTraceBaseSpan {
  return span instanceof SdkTraceBaseSpan;
}
