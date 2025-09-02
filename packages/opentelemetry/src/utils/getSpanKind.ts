import { SpanKind } from '@opentelemetry/api';
import type { AbstractSpan } from '../types';
import { spanHasAttributes, spanHasKind } from './spanTypes';

/**
 * Get the span kind from a span.
 * For whatever reason, this is not public API on the generic "Span" type,
 * so we need to check if we actually have a `SDKTraceBaseSpan` where we can fetch this from.
 * Otherwise, we fall back to `SpanKind.INTERNAL`.
 */
export function getSpanKind(span: AbstractSpan): SpanKind {
  if (spanHasKind(span)) {
    return span.kind;
  }

  if (spanHasAttributes(span)) {
    const kind = span.attributes['otel.kind'];
    if (typeof kind === 'string' && SpanKind[kind as keyof typeof SpanKind]) {
      return SpanKind[kind as keyof typeof SpanKind];
    }
  }

  return SpanKind.INTERNAL;
}
