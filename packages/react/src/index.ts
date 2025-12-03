// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export * from '@sentry/browser';

export { init } from './sdk';
export { captureReactException, reactErrorHandler } from './error';
export { Profiler, withProfiler, useProfiler } from './profiler';
export type { ErrorBoundaryProps, FallbackRender } from './errorboundary';
export { ErrorBoundary, withErrorBoundary } from './errorboundary';
export { createReduxEnhancer } from './redux';
export { reactRouterV3BrowserTracingIntegration } from './reactrouterv3';
export { tanstackRouterBrowserTracingIntegration } from './tanstackrouter';
export {
  withSentryRouting,
  reactRouterV4BrowserTracingIntegration,
  reactRouterV5BrowserTracingIntegration,
} from './reactrouter';
export {
  reactRouterV6BrowserTracingIntegration,
  withSentryReactRouterV6Routing,
  wrapUseRoutesV6,
  wrapCreateBrowserRouterV6,
  wrapCreateMemoryRouterV6,
} from './reactrouterv6';
export {
  reactRouterV7BrowserTracingIntegration,
  withSentryReactRouterV7Routing,
  wrapCreateBrowserRouterV7,
  wrapCreateMemoryRouterV7,
  wrapUseRoutesV7,
} from './reactrouterv7';
