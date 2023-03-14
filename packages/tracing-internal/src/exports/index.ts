export {
  extractTraceparentData,
  getActiveTransaction,
  hasTracingEnabled,
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
