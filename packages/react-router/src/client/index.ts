// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import type { ServerComponentContext, WrapServerFunctionOptions } from '../server/rsc/types';

export * from '@sentry/browser';

export { init } from './sdk';
export {
  reactRouterTracingIntegration,
  type ReactRouterTracingIntegration,
  type ReactRouterTracingIntegrationOptions,
} from './tracingIntegration';

export { captureReactException, reactErrorHandler, Profiler, withProfiler, useProfiler } from '@sentry/react';

/**
 * Just a passthrough in case this is imported from the client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerComponent<T extends (...args: any[]) => any>(
  serverComponent: T,
  _context: ServerComponentContext,
): T {
  return serverComponent;
}

/**
 * Just a passthrough in case this is imported from the client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerFunction<T extends (...args: any[]) => Promise<any>>(
  _functionName: string,
  serverFunction: T,
  _options?: WrapServerFunctionOptions,
): T {
  return serverFunction;
}

/**
 * @deprecated ErrorBoundary is deprecated, use React Router's error boundary instead.
 * See https://docs.sentry.io/platforms/javascript/guides/react-router/#report-errors-from-error-boundaries
 */
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

/**
 * @deprecated ErrorBoundaryProps and FallbackRender are deprecated, use React Router's error boundary instead.
 * See https://docs.sentry.io/platforms/javascript/guides/react-router/#report-errors-from-error-boundaries
 */
export type { ErrorBoundaryProps, FallbackRender } from '@sentry/react';

// React Router instrumentation API for use with unstable_instrumentations (React Router 7.x)
export {
  createSentryClientInstrumentation,
  isClientInstrumentationApiUsed,
  isNavigateHookInvoked,
  type CreateSentryClientInstrumentationOptions,
} from './createClientInstrumentation';
