// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import type { Integration } from '@sentry/core';

export * from '@sentry/node';

export { init } from './sdk';
export { wrapFetchWithSentry } from './wrapFetchWithSentry';
export { wrapMiddlewaresWithSentry } from './middleware';
export { sentryGlobalRequestMiddleware, sentryGlobalFunctionMiddleware } from './globalMiddleware';

/**
 * A no-op stub of the browser tracing integration for the server. Router setup code is shared between client and server,
 * so this stub is needed to prevent build errors during SSR bundling.
 */
export function tanstackRouterBrowserTracingIntegration(
  _router: unknown,
  _options?: Record<string, unknown>,
): Integration {
  return {
    name: 'BrowserTracing',
    setup() {},
  };
}

/**
 * A passthrough error boundary for the server that doesn't depend on any react. Error boundaries don't catch SSR errors
 * so they should simply be a passthrough.
 */
export const ErrorBoundary = (props: React.PropsWithChildren<unknown>): React.ReactNode => {
  if (!props.children) {
    return null;
  }

  if (typeof props.children === 'function') {
    return (props.children as () => React.ReactNode)();
  }

  return props.children;
};

/**
 * A passthrough error boundary wrapper for the server that doesn't depend on any react. Error boundaries don't catch
 * SSR errors so they should simply be a passthrough.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorBoundary<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
): React.FC<P> {
  return WrappedComponent as React.FC<P>;
}
