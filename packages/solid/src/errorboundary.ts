import { captureException } from '@sentry/browser';
import type { Component, JSX } from 'solid-js';
import { mergeProps, splitProps } from 'solid-js';
import { createComponent } from 'solid-js/web';

type ErrorBoundaryProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fallback: JSX.Element | ((err: any, reset: () => void) => JSX.Element);
  children: JSX.Element;
};

/**
 * A higher-order component to wrap Solid's ErrorBoundary to capture exceptions.
 */
export function withSentryErrorBoundary(ErrorBoundary: Component<ErrorBoundaryProps>): Component<ErrorBoundaryProps> {
  const SentryErrorBoundary = (props: ErrorBoundaryProps): JSX.Element => {
    const [local, others] = splitProps(props, ['fallback']);

    const fallback = (error: unknown, reset: () => void): JSX.Element => {
      captureException(error, {
        mechanism: {
          handled: true, // handled because user has to provide a fallback
          type: 'auto.function.solid.error_boundary',
        },
      });

      const f = local.fallback;
      return typeof f === 'function' ? f(error, reset) : f;
    };

    return createComponent(ErrorBoundary, mergeProps({ fallback }, others));
  };

  return SentryErrorBoundary;
}
