export { registerSpanErrorInstrumentation } from './errors';
export { setCapturedScopesOnSpan, getCapturedScopesOnSpan } from './utils';
// eslint-disable-next-line deprecation/deprecation
export { addTracingExtensions } from './hubextensions';
export { startIdleSpan, TRACING_DEFAULTS } from './idleSpan';
export { SentrySpan } from './sentrySpan';
export { SentryNonRecordingSpan } from './sentryNonRecordingSpan';
export {
  setHttpStatus,
  getSpanStatusFromHttpCode,
} from './spanstatus';
export { SPAN_STATUS_ERROR, SPAN_STATUS_OK, SPAN_STATUS_UNSET } from './spanstatus';
export {
  startSpan,
  startInactiveSpan,
  startSpanManual,
  continueTrace,
  withActiveSpan,
  suppressTracing,
  startNewTrace,
} from './trace';
export {
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getDynamicSamplingContextFromScopes,
  spanToBaggageHeader,
} from './dynamicSamplingContext';
export { setMeasurement, timedEventsToMeasurements } from './measurement';
export { sampleSpan } from './sampling';
export { logSpanEnd, logSpanStart } from './logSpans';
export { getSentryHeaders } from './sentryHeaders';
