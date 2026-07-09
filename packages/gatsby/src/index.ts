// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/react';
// Optional browser features and Redux are no longer star-exported through
// `@sentry/react`. Re-export them so `import * as Sentry from '@sentry/gatsby'`
// keeps the historical surface (including `createReduxEnhancer`).
export * from '@sentry/react/optional-browser-api';
// `uiProfiler` is on both `@sentry/react` and `optional-browser-api`; dual
// `export *` would omit the name under ESM rules, so re-export it explicitly.
export { uiProfiler } from '@sentry/react';
export { createReduxEnhancer } from '@sentry/react/redux';

export { init } from './sdk';
