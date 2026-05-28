/**
 * Default implementation of the `shouldHandleError` callback.
 *
 * Returns `true` (capture) for 5xx errors and any error without a `status` property
 *
 * Returns `false` (skip) for 3xx and 4xx errors (they still generate spans and transactions for tracing)
 *
 * Checks any error-like value that carries a numeric `status` property. This covers
 * Hono's `HTTPException`, third-party middleware errors, and custom error subclasses.
 */
export function defaultShouldHandleError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return true;
  }

  const status = (error as { status?: unknown }).status;

  return !(typeof status === 'number' && status >= 300 && status < 500);
}

/**
 * Determines whether an error should be captured and sent to Sentry.
 * Uses `shouldHandleError` when provided, otherwise falls back to `defaultShouldHandleError`.
 */
export function shouldCaptureError(error: unknown, shouldHandleError?: (error: unknown) => boolean): boolean {
  return (shouldHandleError ?? defaultShouldHandleError)(error);
}
