export * from '@sentry/browser';

export { init } from './sdk';
export { reactRouterTracingIntegration } from './tracingIntegration';

export { captureReactException, reactErrorHandler, Profiler, withProfiler, useProfiler } from '@sentry/react';

/**
 * @deprecated ErrorBoundary is deprecated, use react router's error boundary instead.
 * See https://docs.sentry.io/platforms/javascript/guides/react-router/#report-errors-from-error-boundaries
 */
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

/**
 * @deprecated ErrorBoundaryProps and FallbackRender are deprecated, use react router's error boundary instead.
 * See https://docs.sentry.io/platforms/javascript/guides/react-router/#report-errors-from-error-boundaries
 */
export type { ErrorBoundaryProps, FallbackRender } from '@sentry/react';
