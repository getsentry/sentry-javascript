/**
 * Read-only check for the `__sentry_captured__` flag set by `captureException`.
 * Only reads the flag — does not mark the error — to avoid conflicting with
 * the internal dedup in `captureException`.
 */
export function isAlreadyCaptured(exception: unknown): boolean {
  if (exception == null || typeof exception !== 'object') {
    return false;
  }
  try {
    return !!(exception as Record<string, unknown>).__sentry_captured__;
  } catch {
    return false;
  }
}

/**
 * Check if an error/response is a redirect.
 * Handles both Response objects and internal React Router throwables.
 */
export function isRedirectResponse(error: unknown): boolean {
  if (error instanceof Response) {
    const status = error.status;
    return status >= 300 && status < 400;
  }

  if (error && typeof error === 'object') {
    const errorObj = error as { status?: number; type?: unknown };

    if (typeof errorObj.type === 'string' && errorObj.type === 'redirect') {
      return true;
    }

    if (typeof errorObj.status === 'number' && errorObj.status >= 300 && errorObj.status < 400) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an error/response is a not-found response (404).
 * Handles both Response objects and internal React Router throwables.
 */
export function isNotFoundResponse(error: unknown): boolean {
  if (error instanceof Response) {
    return error.status === 404;
  }

  if (error && typeof error === 'object') {
    const errorObj = error as { status?: number; type?: unknown };

    if (typeof errorObj.type === 'string' && (errorObj.type === 'not-found' || errorObj.type === 'notFound')) {
      return true;
    }

    if (errorObj.status === 404) {
      return true;
    }
  }

  return false;
}
