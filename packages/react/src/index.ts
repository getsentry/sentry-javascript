export * from '@sentry/browser';

export { init } from './sdk';
export { Profiler, withProfiler, useProfiler } from './profiler';
export type { ErrorBoundaryProps, FallbackRender } from './errorboundary';
export { ErrorBoundary, withErrorBoundary } from './errorboundary';
export { createReduxEnhancer } from './redux';
export { reactRouterV3Instrumentation } from './reactrouterv3';
export {
  reactRouterV4Instrumentation,
  reactRouterV5Instrumentation,
  withSentryRouting,
} from './reactrouterv4v5/routing-instrumentation';
export {
  reactRouterV4Integration,
  reactRouterV5Integration,
} from './reactrouterv4v5/integration';
export {
  reactRouterV6Instrumentation,
  withSentryReactRouterV6Routing,
  wrapUseRoutes,
  wrapCreateBrowserRouter,
} from './reactrouterv6';
