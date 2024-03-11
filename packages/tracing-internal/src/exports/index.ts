export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  hasTracingEnabled,
  Transaction,
} from '@sentry/core';
export { stripUrlQueryAndFragment, TRACEPARENT_REGEXP } from '@sentry/utils';
