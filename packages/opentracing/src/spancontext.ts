import { uuid4 } from '@sentry/utils/misc';

/**
 * SpanContext represents Span state that must propagate to descendant Spans
 * and across process boundaries.
 *
 * SpanContext is logically divided into two pieces: the user-level "Baggage"
 * (see setBaggageItem and getBaggageItem) that propagates across Span
 * boundaries and any Tracer-implementation-specific fields that are needed to
 * identify or otherwise contextualize the associated Span instance (e.g., a
 * <trace_id, span_id, sampled> tuple).
 */
export class SpanContext {
  public constructor(
    public readonly traceId?: string,
    public readonly spanId: string = uuid4().substring(16), // private readonly parentId: string,
  ) {}

  /**
   * Returns debug version of the span.
   */
  public toString(): string {
    return `${(this.traceId && `trace-id:${this.traceId};`) || ''}span-id:${this.spanId}`;
  }
}
