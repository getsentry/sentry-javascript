import { TraceState } from '@opentelemetry/core';
import type { DynamicSamplingContext } from '@sentry/core';
import { SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, _setDscOnTraceState } from '../constants';

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
  const traceStateBase = new TraceState();

  const traceStateWithDsc = dsc ? _setDscOnTraceState(traceStateBase, dsc) : traceStateBase;

  // We also specifically want to store if this is sampled to be not recording,
  // or unsampled (=could be either sampled or not)
  return sampled === false ? traceStateWithDsc.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1') : traceStateWithDsc;
}
