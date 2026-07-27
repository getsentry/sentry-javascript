import { captureException } from '@sentry/browser';
import { isError } from '@sentry/core/browser';
import type { ErrorInfo } from 'react';

/**
 * Recurse through `error.cause` chain to set cause on an error.
 */
export function setCause(error: Error & { cause?: Error }, cause: Error): void {
  const seenErrors = new WeakSet();

  function recurse(error: Error & { cause?: Error }, cause: Error): void {
    // If we've already seen the error, there is a recursive loop somewhere in the error's
    // cause chain. Let's just bail out then to prevent a stack overflow.
    if (seenErrors.has(error)) {
      return;
    }
    if (error.cause) {
      seenErrors.add(error);
      return recurse(error.cause, cause);
    }
    error.cause = cause;
  }

  recurse(error, cause);
}

/**
 * Captures an error that was thrown by a React ErrorBoundary or React root.
 *
 * @param error The error to capture.
 * @param errorInfo The errorInfo provided by React.
 * @param hint Optional additional data to attach to the Sentry event.
 * @returns the id of the captured Sentry event.
 */
export function captureReactException(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  { componentStack }: ErrorInfo,
  hint?: Parameters<typeof captureException>[1],
): string {
  // Create a stack trace from the componentStack param and link it to the original error
  // using `error.cause`. Linking errors requires the `LinkedErrors` integration be enabled.
  // See: https://reactjs.org/blog/2020/08/10/react-v17-rc.html#native-component-stacks
  //
  // Although `componentDidCatch` is typed to accept an `Error` object, it can also be invoked
  // with non-error objects. This is why we need to check if the error is an error-like object.
  // See: https://github.com/getsentry/sentry-javascript/issues/6167
  if (isError(error) && componentStack) {
    const errorBoundaryError = new Error(error.message);
    errorBoundaryError.name = `React ErrorBoundary ${error.name}`;
    errorBoundaryError.stack = componentStack;

    // Using the `LinkedErrors` integration to link the errors together.
    setCause(error, errorBoundaryError);
  }

  return captureException(error, hint);
}

/**
 * Creates an error handler that can be used with the `onCaughtError`, `onUncaughtError`,
 * and `onRecoverableError` options in `createRoot` and `hydrateRoot` React DOM methods.
 *
 * @param callback An optional callback that will be called after the error is captured.
 * Use this to add custom handling for errors.
 *
 * @example
 *
 * ```JavaScript
 * const root = createRoot(container, {
 *  onCaughtError: Sentry.reactErrorHandler(),
 *  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
 *    console.warn('Caught error', error, errorInfo.componentStack);
 *  });
 * });
 * ```
 */
export function reactErrorHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback?: (error: any, errorInfo: ErrorInfo, eventId: string) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (error: any, errorInfo: ErrorInfo) => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (error: any, errorInfo: ErrorInfo) => {
    const hasCallback = !!callback;
    const eventId = captureReactException(error, errorInfo, {
      mechanism: { handled: hasCallback, type: 'auto.function.react.error_handler' },
    });
    if (hasCallback) {
      callback(error, errorInfo, eventId);
    }
  };
}
