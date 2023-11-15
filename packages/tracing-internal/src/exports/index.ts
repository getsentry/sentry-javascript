export {
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  getActiveTransaction,
  hasTracingEnabled,
  IdleTransaction,
  Span,
  // eslint-disable-next-line deprecation/deprecation
  SpanStatus,
  spanStatusfromHttpCode,
  startIdleTransaction,
  Transaction,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { stripUrlQueryAndFragment, TRACEPARENT_REGEXP } from '@sentry/utils';
