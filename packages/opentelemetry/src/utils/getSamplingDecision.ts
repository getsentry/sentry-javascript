import type { SpanContext } from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import { baggageHeaderToDynamicSamplingContext } from '@sentry/utils';
import { SENTRY_TRACE_STATE_DSC, SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING } from '../constants';

/**
 * OpenTelemetry only knows about SAMPLED or NONE decision,
 * but for us it is important to differentiate between unset and unsampled.
 *
 * Both of these are identified as `traceFlags === TracegFlags.NONE`,
 * but we additionally look at a special trace state to differentiate between them.
 */
export function getSamplingDecision(spanContext: SpanContext): boolean | undefined {
  const { traceFlags, traceState } = spanContext;

  const sampledNotRecording = traceState ? traceState.get(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING) === '1' : false;

  // If trace flag is `SAMPLED`, we interpret this as sampled
  // If it is `NONE`, it could mean either it was sampled to be not recorder, or that it was not sampled at all
  // For us this is an important difference, sow e look at the SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING
  // to identify which it is
  if (traceFlags === TraceFlags.SAMPLED) {
    return true;
  }

  if (sampledNotRecording) {
    return false;
  }

  // Fall back to DSC as a last resort, that may also contain `sampled`...
  const dscString = traceState ? traceState.get(SENTRY_TRACE_STATE_DSC) : undefined;
  const dsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;

  if (dsc?.sampled === 'true') {
    return true;
  }
  if (dsc?.sampled === 'false') {
    return false;
  }

  return undefined;
}
