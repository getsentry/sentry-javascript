// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/browser';

export { init } from './sdk';
export { browserTracingIntegration } from './browserTracingIntegration';
export { attachErrorHandler } from './errorhandler';
export { createTracingMixins } from './tracing';
export { vueIntegration } from './integration';
export type { VueIntegrationOptions } from './integration';
export { createSentryPiniaPlugin } from './pinia';
