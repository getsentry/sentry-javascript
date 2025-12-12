// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/svelte';

export { init } from './sdk';
export { handleErrorWithSentry } from './handleError';
export { wrapLoadWithSentry } from './load';
export { browserTracingIntegration } from './browserTracingIntegration';
