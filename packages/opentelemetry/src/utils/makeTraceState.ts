import { TraceState } from '@opentelemetry/core';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/core';
import type { DynamicSamplingContext } from '@sentry/core';
import { SENTRY_TRACE_STATE_DSC, SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING } from '../constants';

/**
 * Generate a TraceState for the given data.
 */
export function makeTraceState({
  dsc,
  sampled,
}: {
  dsc?: Partial<DynamicSamplingContext>;
  sampled?: boolean;
}): TraceState {
  // We store the DSC as OTEL trace state on the span context
  const dscString = dsc ? dynamicSamplingContextToSentryBaggageHeader(dsc) : undefined;

  const traceStateBase = new TraceState();

  const traceStateWithDsc = dscString ? traceStateBase.set(SENTRY_TRACE_STATE_DSC, dscString) : traceStateBase;

  // We also specifically want to store if this is sampled to be not recording,
  // or unsampled (=could be either sampled or not)
  return sampled === false ? traceStateWithDsc.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1') : traceStateWithDsc;
}
