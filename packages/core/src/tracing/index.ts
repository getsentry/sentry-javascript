export {
  // eslint-disable-next-line deprecation/deprecation
  startIdleTransaction,
  addTracingExtensions,
} from './hubextensions';
export { startIdleSpan, TRACING_DEFAULTS } from './idlespan';
// eslint-disable-next-line deprecation/deprecation
export { IdleTransaction } from './idletransaction';
// eslint-disable-next-line deprecation/deprecation
export type { BeforeFinishCallback } from './idletransaction';
export { Span, spanStatusfromHttpCode } from './span';
export { Transaction } from './transaction';
// eslint-disable-next-line deprecation/deprecation
export { extractTraceparentData, getActiveTransaction } from './utils';
// eslint-disable-next-line deprecation/deprecation
export { SpanStatus } from './spanstatus';
export type { SpanStatusType } from './span';
export {
  trace,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startSpanManual,
  continueTrace,
} from './trace';
export { getDynamicSamplingContextFromClient } from './dynamicSamplingContext';
export { setMeasurement } from './measurement';
