// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/react';
// Optional browser features are no longer star-exported through `@sentry/react`.
export * from '@sentry/react/optional-browser-api';

export { init } from './sdk';
