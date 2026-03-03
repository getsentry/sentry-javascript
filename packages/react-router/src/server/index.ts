// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/node';

export { init } from './sdk';
// eslint-disable-next-line deprecation/deprecation
export { wrapSentryHandleRequest, sentryHandleRequest } from './wrapSentryHandleRequest';
export { createSentryHandleRequest, type SentryHandleRequestOptions } from './createSentryHandleRequest';
export { wrapServerAction } from './wrapServerAction';
export { wrapServerLoader } from './wrapServerLoader';
export { createSentryHandleError, type SentryHandleErrorOptions } from './createSentryHandleError';
export { getMetaTagTransformer } from './getMetaTagTransformer';

// React Router instrumentation API support (works with both unstable_instrumentations and instrumentations)
export {
  createSentryServerInstrumentation,
  isInstrumentationApiUsed,
  type CreateSentryServerInstrumentationOptions,
} from './createServerInstrumentation';
