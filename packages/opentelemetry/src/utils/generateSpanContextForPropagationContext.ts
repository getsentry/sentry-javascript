import type { SpanContext } from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import type { PropagationContext } from '@sentry/core';
import { makeTraceState } from './makeTraceState';

/**
 * Generates a SpanContext that represents a PropagationContext.
 * This can be set on a `context` to make this a (virtual) active span.
 *
 * @deprecated This function is deprecated and will be removed in the next major version.
 */
export function generateSpanContextForPropagationContext(propagationContext: PropagationContext): SpanContext {
  // We store the DSC as OTEL trace state on the span context
  const traceState = makeTraceState({
    dsc: propagationContext.dsc,
    sampled: propagationContext.sampled,
  });

  const spanContext: SpanContext = {
    traceId: propagationContext.traceId,
    // TODO: Do not create an invalid span context here
    spanId: propagationContext.parentSpanId || '',
    isRemote: true,
    traceFlags: propagationContext.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState,
  };

  return spanContext;
}
