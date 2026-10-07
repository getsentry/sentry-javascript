import type { Span, SpanTimeInput } from '@sentry/core';

/**
 * Links a `Classifier.evaluate()` call to the Sentry span the exporter opens for its
 * `classifier_evaluation` span. Mastra's span carries no input or output, so the integration adds
 * them from the call. Mastra ends its span before `evaluate()` returns the answers, so the exporter
 * leaves the Sentry span open and the integration ends it once the call settles.
 */
export interface ClassifierEvaluationCall {
  span?: Span;
  /** The recording options of the exporter that opened the span, so the call's data follows them. */
  recordInputs?: boolean;
  recordOutputs?: boolean;
  /** Mastra's end time, set when Mastra ended its span before the call settled. */
  endTime?: SpanTimeInput;
  settled?: boolean;
}

// Mastra emits `span_started` synchronously inside `evaluate()`, before its first `await`, so at
// most one call is ever in this window.
let startingCall: ClassifierEvaluationCall | undefined;

export function setStartingClassifierEvaluation(call: ClassifierEvaluationCall | undefined): void {
  startingCall = call;
}

export function takeStartingClassifierEvaluation(): ClassifierEvaluationCall | undefined {
  const call = startingCall;
  startingCall = undefined;
  return call;
}
