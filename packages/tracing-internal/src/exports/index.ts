export {
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  hasTracingEnabled,
  IdleTransaction,
  Span,
  // eslint-disable-next-line deprecation/deprecation
  SpanStatus,
  startIdleTransaction,
  Transaction,
} from '@sentry/core';
export type { SpanStatusType } from '@sentry/core';
export { stripUrlQueryAndFragment, TRACEPARENT_REGEXP } from '@sentry/utils';
