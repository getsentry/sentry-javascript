/**
 * 3xx and 4xx errors are expected (redirects, auth failures, not found, bad
 * request) and should not be captured as Sentry error events.
 *
 * Checks any error-like value that carries a numeric `status` property — this
 * covers Hono's `HTTPException`, third-party middleware errors, and custom
 * error subclasses.
 */
export function isExpectedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === 'number' && status >= 300 && status < 500;
}
