import { isError } from '@sentry/core';

/**
 * Returns the value that a handler threw, so that `shouldHandleError` and the event get that value
 * and not Hono's wrapper.
 *
 * Hono 5 wraps a thrown non-Error before its error handlers run:
 * `new Error(typeof err === 'string' ? err : undefined, { cause: err })`.
 * The wrapper has no marker, so it is found by its shape. A user error with the same shape is also unwrapped.
 */
export function unwrapThrownValue(error: unknown): unknown {
  if (!isError(error) || error.constructor !== Error || !('cause' in error)) {
    return error;
  }

  const { cause } = error;
  if (isError(cause)) {
    return error;
  }

  const wrapperMessage = typeof cause === 'string' ? cause : '';
  return error.message === wrapperMessage ? cause : error;
}
