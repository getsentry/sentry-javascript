import { DEBUG_BUILD } from '../debug-build';
import { debug } from './debug-logger';
import { isThenable } from './is';

/**
 * Invokes a user-provided callback (e.g. `beforeSend`, `tracesSampler`, an integration hook) so that
 * neither a synchronous throw nor a rejected promise escapes into the caller. On failure the error is
 * logged and `fallback(error)` supplies the result instead.
 *
 * Not for `startSpan` bodies: those must re-throw and are handled by `handleCallbackErrors`.
 *
 * @param message - Logged via `debug.error` together with the error. Pass it as `DEBUG_BUILD ? '...' : ''`
 *   so the string is tree-shaken from non-debug bundles.
 * @param fn - Invokes the callback.
 * @param fallback - Produces the result to use when the callback throws or rejects.
 */
export function safeCallback<T>(message: string, fn: () => T, fallback: (error: unknown) => T): T {
  let result: T;
  try {
    result = fn();
  } catch (error) {
    return recover(message, error, fallback);
  }

  if (isThenable(result)) {
    return result.then(undefined, (error: unknown) => recover(message, error, fallback)) as T;
  }

  return result;
}

function recover<T>(message: string, error: unknown, fallback: (error: unknown) => T): T {
  DEBUG_BUILD && debug.error(message, error);
  return fallback(error);
}
