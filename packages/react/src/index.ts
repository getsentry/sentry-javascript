export * from '@sentry/browser';

export { init } from './sdk';
export { reactErrorHandler } from './error';
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
  // eslint-disable-next-line deprecation/deprecation
  wrapUseRoutes,
  wrapUseRoutesV6,
  // eslint-disable-next-line deprecation/deprecation
  wrapCreateBrowserRouter,
  wrapCreateBrowserRouterV6,
} from './reactrouterv6';
export {
  reactRouterV7BrowserTracingIntegration,
  withSentryReactRouterV7Routing,
  wrapCreateBrowserRouterV7,
  wrapUseRoutesV7,
} from './reactrouterv7';
