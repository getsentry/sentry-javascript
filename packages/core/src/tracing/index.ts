export { registerSpanErrorInstrumentation } from './errors';
export { setCapturedScopesOnSpan, getCapturedScopesOnSpan } from './utils';
export { startIdleSpan, TRACING_DEFAULTS } from './idleSpan';
export { SentrySpan } from './sentrySpan';
export { SentryNonRecordingSpan } from './sentryNonRecordingSpan';
export { setHttpStatus, getSpanStatusFromHttpCode } from './spanstatus';
export { SPAN_STATUS_ERROR, SPAN_STATUS_OK, SPAN_STATUS_UNSET } from './spanstatus';
export {
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  withActiveSpan,
  suppressTracing,
  startNewTrace,
  SUPPRESS_TRACING_KEY,
} from './trace';
export {
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getDynamicSamplingContextFromScope,
  spanToBaggageHeader,
  DSC_TRACE_STATE_PREFIX,
  DSC_TRACE_STATE_KEYS,
  _getDscFromTraceState,
  _encodeTraceState,
  _decodeTraceState,
} from './dynamicSamplingContext';
export { setMeasurement, timedEventsToMeasurements } from './measurement';
export { sampleSpan } from './sampling';
export { logSpanEnd, logSpanStart } from './logSpans';

// Span Streaming
export { captureSpan } from './spans/captureSpan';
