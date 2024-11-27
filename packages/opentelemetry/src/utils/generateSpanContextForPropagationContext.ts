import type { SpanContext } from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import { uuid4 } from '@sentry/core';
import type { PropagationContext } from '@sentry/types';
import { makeTraceState } from './makeTraceState';

/**
 * Generates a SpanContext that represents a PropagationContext.
 * This can be set on a `context` to make this a (virtual) active span.
 */
export function generateSpanContextForPropagationContext(propagationContext: PropagationContext): SpanContext {
  // We store the DSC as OTEL trace state on the span context
  const traceState = makeTraceState({
    parentSpanId: propagationContext.parentSpanId,
    dsc: propagationContext.dsc,
    sampled: propagationContext.sampled,
  });

  const spanContext: SpanContext = {
    traceId: propagationContext.traceId,
    // If we have no parent span ID, just generate a random one
    spanId: propagationContext.parentSpanId || uuid4().substring(16),
    isRemote: true,
    traceFlags: propagationContext.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState,
  };

  return spanContext;
}
