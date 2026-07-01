import type { SpanContext } from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import type { Client, Span } from '@sentry/core';
import {
  baggageHeaderToDynamicSamplingContext,
  getRootSpan,
  hasSpansEnabled,
  spanIsSampled,
  spanIsSentrySpan,
} from '@sentry/core';
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

/**
 * Resolve a span's sampling decision for trace propagation, also handling native Sentry spans.
 *
 * Prefer the OpenTelemetry trace state via {@link getSamplingDecision}. Native Sentry spans (created
 * by the `SentryTracerProvider`) don't carry that trace state, so when it's absent we fall back to the
 * span's own decision via `spanIsSampled` — but only for an *explicit* decision. An explicit decision
 * always originates at a real `SentrySpan` root (a negatively sampled root, or a child of one). A
 * non-recording placeholder root (an orphan/suppressed span, or a TwP placeholder) and a remote span
 * have a *deferred* decision that lives elsewhere (the scope, or the incoming trace state), so we
 * return `undefined` and leave the decision deferred rather than wrongly asserting `-0`.
 *
 * TODO(v11): Once the OTel SDK provider is gone and every local span is a native Sentry span, the
 * trace-state lookup only matters for remote (incoming) spans; the local path always reads the span's
 * own decision, so the "native-vs-OTel-SDK span" framing can be dropped (local → span, remote → trace state).
 */
export function getSampledForPropagation(span: Span, client: Client | undefined): boolean | undefined {
  const spanContext = span.spanContext();

  // Prefer the OTel trace state: it carries the decision for OTel SDK spans and for remote (incoming)
  // spans, and unambiguously separates sampled / unsampled / deferred.
  const samplingDecision = getSamplingDecision(spanContext);
  if (samplingDecision !== undefined) {
    return samplingDecision;
  }

  // No trace state in it. Only read the span's own decision (`spanIsSampled`) when it's an explicit
  // one, which lives on a native recording `SentrySpan` root (created by the SentryTracerProvider).
  // Everything else defers: TwP (deferred), remote spans (decision is in the incoming trace state),
  // and non-recording placeholder roots — whether a Sentry orphan/suppressed span or, on the OTel SDK
  // path, an OpenTelemetry `NonRecordingSpan` (which `spanIsSentrySpan` also excludes).
  if (!hasSpansEnabled(client?.getOptions()) || spanContext.isRemote || !spanIsSentrySpan(getRootSpan(span))) {
    return undefined;
  }

  return spanIsSampled(span);
}
