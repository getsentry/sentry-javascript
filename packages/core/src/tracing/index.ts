export { registerSpanErrorInstrumentation } from './errors';
export {
  setCapturedScopesOnSpan,
  getCapturedScopesOnSpan,
  markSpanAsTracerProviderSpan,
  spanIsTracerProviderSpan,
} from './utils';
export { TRACING_DEFAULTS } from './idleSpan';
export { SentrySpan } from './sentrySpan';
export { _INTERNAL_setDeferSegmentSpanCapture } from './deferSegmentSpanCapture';
export { SentryNonRecordingSpan } from './sentryNonRecordingSpan';
export {
  setHttpStatus,
  getSpanStatusFromHttpCode,
  isStatusErrorMessageValid,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  SPAN_STATUS_UNSET,
} from './spanstatus';
// Note: `startSpan`, `startInactiveSpan`, `startSpanManual` and `startIdleSpan` are deliberately
// not re-exported here. They exist in a plain variant (`server-exports`) and a span-streaming-aware
// variant (`browser-exports`) under the same name — see `browser-exports.ts` for why.
export {
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  withActiveSpan,
  suppressTracing,
  isTracingSuppressed,
  startNewTrace,
  spanIsIgnored,
} from './trace';
export { bindScopeToEmitter } from './bindScopeToEmitter';
export {
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getDynamicSamplingContextFromScope,
  spanToBaggageHeader,
} from './dynamicSamplingContext';
export { setMeasurement, timedEventsToMeasurements } from './measurement';
export { sampleSpan } from './sampling';
export { logSpanEnd, logSpanStart } from './logSpans';

// Span Streaming
export { captureSpan } from './spans/captureSpan';
