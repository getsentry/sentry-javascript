export { startIdleTransaction, addTracingExtensions } from './hubextensions';
export { IdleTransaction, TRACING_DEFAULTS } from './idletransaction';
export type { BeforeFinishCallback } from './idletransaction';
export { Span } from './span';
export { Transaction } from './transaction';
// eslint-disable-next-line deprecation/deprecation
export { extractTraceparentData, getActiveTransaction } from './utils';
// eslint-disable-next-line deprecation/deprecation
export { SpanStatus } from './spanstatus';
export {
  setHttpStatus,
  getSpanStatusFromHttpCode,
} from './spanstatus';
export type { SpanStatusType } from './spanstatus';
export {
  // eslint-disable-next-line deprecation/deprecation
  trace,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startSpanManual,
  continueTrace,
  setCapturedScopesOnSpan,
} from './trace';
export { getDynamicSamplingContextFromClient, getDynamicSamplingContextFromSpan } from './dynamicSamplingContext';
export { setMeasurement } from './measurement';
