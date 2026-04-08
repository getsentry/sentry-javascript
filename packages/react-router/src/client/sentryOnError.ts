import { captureException } from '@sentry/core';
import { captureReactException } from '@sentry/react';

/**
 * A handler function for React Router's `onError` prop on `HydratedRouter`.
 *
 * Reports errors to Sentry.
 *
 * @example (entry.client.tsx)
 * ```tsx
 * import { sentryOnError } from '@sentry/react-router';
 *
 * startTransition(() => {
 *   hydrateRoot(
 *     document,
 *     <HydratedRouter onError={sentryOnError} />
 *   );
 * });
 * ```
 */
export function sentryOnError(
  error: unknown,
  {
    errorInfo,
  }: {
    errorInfo?: React.ErrorInfo;
  },
): void {
  const mechanism = { handled: false, type: 'auto.function.react_router.on_error' };

  if (errorInfo) {
    captureReactException(error, errorInfo, { mechanism });
  } else {
    captureException(error, { mechanism });
  }
}
