// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */

/**
 * @sentry/react public entry — tree-shakeable by default.
 *
 * Deliberately does **not** use `export * from '@sentry/browser'`. That star-export
 * put every optional browser feature (Session Replay, Feedback UI, AI SDKs, feature
 * flags, …) on this module's export list. Bundlers that materialize the full
 * namespace for `import('@sentry/react')` (Rolldown when destructuring the result)
 * then shipped hundreds of KB of unused code on the critical path.
 *
 * Optional browser features: import from `@sentry/browser` or the dedicated package.
 * Router-specific integrations: import from a subpath, e.g.
 * `@sentry/react/tanstackrouter`.
 */

export * from './browser-api';

export { init } from './sdk';
export { captureReactException, reactErrorHandler } from './error';
export { Profiler, withProfiler, useProfiler } from './profiler';
export type { ErrorBoundaryProps, FallbackRender } from './errorboundary';
export { ErrorBoundary, withErrorBoundary } from './errorboundary';

// Router / Redux integrations live on subpaths so they are not part of this
// entry's export list (see package.json "exports"). Re-exporting them here would
// re-introduce the tree-shaking hole for dynamic `import('@sentry/react')`.
//
//   import { tanstackRouterBrowserTracingIntegration } from '@sentry/react/tanstackrouter';
//   import { createReduxEnhancer } from '@sentry/react/redux';
//   import { reactRouterV6BrowserTracingIntegration } from '@sentry/react/reactrouterv6';
//   …
