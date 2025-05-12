import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/**
 * Get the parent span id from a span.
 * In OTel v1, the parent span id is accessed as `parentSpanId`
 * In OTel v2, the parent span id is accessed as `spanId` on the `parentSpanContext`
 */
export function getParentSpanId(span: ReadableSpan): string | undefined {
  if ('parentSpanId' in span) {
    return span.parentSpanId as string | undefined;
  } else if ('parentSpanContext' in span) {
    return (span.parentSpanContext as { spanId?: string } | undefined)?.spanId;
  }

  return undefined;
}
