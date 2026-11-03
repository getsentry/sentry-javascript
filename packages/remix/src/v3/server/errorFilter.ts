import { captureException, isObjectLike } from '@sentry/core';

/** Decides whether a thrown value should become a Sentry issue. */
export type ShouldHandleError = (error: unknown) => boolean;

/**
 * Skip 3xx and 4xx errors, capture everything else. A numeric `status` in that range is an expected
 * outcome, not a fault, and the request still produces a span.
 */
export function defaultShouldHandleError(error: unknown): boolean {
  if (!isObjectLike(error)) {
    return true;
  }

  const status = error.status;

  return !(typeof status === 'number' && status >= 300 && status < 500);
}

// Configured at `Sentry.init()`, but read by subscribers installed earlier by the `--import` entry, so
// it lives in module scope rather than being captured before it exists.
let shouldHandleError: ShouldHandleError = defaultShouldHandleError;

/** @internal Set by the integration during `Sentry.init()`. */
export function setShouldHandleError(filter: ShouldHandleError | undefined): void {
  shouldHandleError = filter ?? defaultShouldHandleError;
}

/**
 * Report an error unless it is an aborted request or filtered out.
 *
 * A router failure can arrive twice, from the middleware and again from `onError`. `captureException`
 * marks the object `__sentry_captured__` and drops the second report; only a thrown primitive cannot
 * be marked and may be reported twice.
 */
export function captureRequestError(error: unknown, request: Request | undefined, mechanism: string): boolean {
  // The app's filter can throw. Letting that out would replace the request's own error and skip the
  // app's `onError`, so reporting is best effort.
  try {
    if (request && isRequestAbort(error, request)) {
      return false;
    }
    if (!shouldHandleError(error)) {
      return false;
    }
    captureException(error, { mechanism: { handled: false, type: mechanism } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a rejection is the client giving up rather than the app failing. The router rejects with
 * `signal.reason` when the connection drops; without this check every user navigating away mid
 * request creates an issue.
 */
export function isRequestAbort(error: unknown, request: Request): boolean {
  return request.signal.aborted && error === request.signal.reason;
}
