export * from '@sentry/browser';

export { init } from './sdk';
export { Profiler, withProfiler, useProfiler } from './profiler';
export type { ErrorBoundaryProps, FallbackRender } from './errorboundary';
export { ErrorBoundary, withErrorBoundary } from './errorboundary';
export { createReduxEnhancer } from './redux';
export {
  // eslint-disable-next-line deprecation/deprecation
  reactRouterV3Instrumentation,
  reactRouterV3BrowserTracingIntegration,
} from './reactrouterv3';
export {
  // eslint-disable-next-line deprecation/deprecation
  reactRouterV4Instrumentation,
  // eslint-disable-next-line deprecation/deprecation
  reactRouterV5Instrumentation,
  withSentryRouting,
  reactRouterV4BrowserTracingIntegration,
  reactRouterV5BrowserTracingIntegration,
} from './reactrouter';
export {
  // eslint-disable-next-line deprecation/deprecation
  reactRouterV6Instrumentation,
  reactRouterV6BrowserTracingIntegration,
  withSentryReactRouterV6Routing,
  wrapUseRoutes,
  wrapCreateBrowserRouter,
} from './reactrouterv6';
