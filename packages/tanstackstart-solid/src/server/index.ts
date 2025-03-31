export * from '@sentry/node';

import type { Component, JSX } from 'solid-js';

/**
 * A passthrough error boundary for the server that doesn't depend on any react. Error boundaries don't catch SSR errors
 * so they should simply be a passthrough.
 */
export const ErrorBoundary = (props: { children?: JSX.Element | (() => JSX.Element) }): JSX.Element => {
  if (!props.children) {
    return null;
  }

  if (typeof props.children === 'function') {
    return props.children();
  }

  return props.children;
};

/**
 * A passthrough store enhancer for the server that doesn't depend on anything from the `@sentry/react` package.
 */
export function createStoreEnhancer() {
  return (createStore: unknown) => createStore;
}

/**
 * A passthrough error boundary wrapper for the server that doesn't depend on any react. Error boundaries don't catch
 * SSR errors so they should simply be a passthrough.
 */
export function withErrorBoundary<P extends Record<string, unknown>>(
  WrappedComponent: Component<P>,
): Component<P> {
  return WrappedComponent;
}

/**
 * Just a passthrough since we're on the server and showing the report dialog on the server doesn't make any sense.
 */
export function showReportDialog(): void {
  return;
}
