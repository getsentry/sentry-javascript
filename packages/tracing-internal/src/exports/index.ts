export {
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  getActiveTransaction,
  hasTracingEnabled,
  // eslint-disable-next-line deprecation/deprecation
  IdleTransaction,
  Span,
  // eslint-disable-next-line deprecation/deprecation
  SpanStatus,
  spanStatusfromHttpCode,
  // eslint-disable-next-line deprecation/deprecation
  startIdleTransaction,
  Transaction,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { stripUrlQueryAndFragment, TRACEPARENT_REGEXP } from '@sentry/utils';
