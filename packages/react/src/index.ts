export * from '@sentry/browser';

export { init } from './sdk';
export { Profiler, withProfiler, useProfiler } from './profiler';
export type { ErrorBoundaryProps, FallbackRender } from './errorboundary';
export { ErrorBoundary, withErrorBoundary } from './errorboundary';
export { createReduxEnhancer } from './redux';
export { reactRouterV3Instrumentation } from './reactrouterv3';
export { reactRouterV4Instrumentation, reactRouterV5Instrumentation, withSentryRouting } from './reactrouter';
export {
  // eslint-disable-next-line deprecation/deprecation
  reactRouterV6Instrumentation,
  reactRouterV6BrowserTracingIntegration,
  withSentryReactRouterV6Routing,
  wrapUseRoutes,
  wrapCreateBrowserRouter,
} from './reactrouterv6';
