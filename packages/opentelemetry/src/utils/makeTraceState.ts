import { TraceState } from '@opentelemetry/core';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/core';
import type { DynamicSamplingContext } from '@sentry/core';
import {
  SENTRY_TRACE_STATE_DSC,
  SENTRY_TRACE_STATE_PARENT_SPAN_ID,
  SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING,
} from '../constants';

/**
 * Generate a TraceState for the given data.
 */
export function makeTraceState({
  parentSpanId,
  dsc,
  sampled,
}: {
  parentSpanId?: string;
  dsc?: Partial<DynamicSamplingContext>;
  sampled?: boolean;
}): TraceState {
  // We store the DSC as OTEL trace state on the span context
  const dscString = dsc ? dynamicSamplingContextToSentryBaggageHeader(dsc) : undefined;

  // We _always_ set the parent span ID, even if it is empty
  // If we'd set this to 'undefined' we could not know if the trace state was set, but there was no parentSpanId,
  // vs the trace state was not set at all (in which case we want to do fallback handling)
  // If `''`, it should be considered "no parent"
  const traceStateBase = new TraceState().set(SENTRY_TRACE_STATE_PARENT_SPAN_ID, parentSpanId || '');

  const traceStateWithDsc = dscString ? traceStateBase.set(SENTRY_TRACE_STATE_DSC, dscString) : traceStateBase;

  // We also specifically want to store if this is sampled to be not recording,
  // or unsampled (=could be either sampled or not)
  return sampled === false ? traceStateWithDsc.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1') : traceStateWithDsc;
}
