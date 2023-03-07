export {
  extractTraceparentData,
  getActiveTransaction,
  hasTracingEnabled,
  addTracingExtensions,
  IdleTransaction,
  Span,
  // eslint-disable-next-line deprecation/deprecation
  SpanStatus,
  spanStatusfromHttpCode,
  startIdleTransaction,
  stripUrlQueryAndFragment,
  TRACEPARENT_REGEXP,
  Transaction,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
