import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';

/**
 * Read-only check for the `__sentry_captured__` flag set by `captureException`.
 * Unlike `checkOrSetAlreadyCaught` (in `@sentry/core`, `packages/core/src/utils/misc.ts`),
 * this does NOT mark the error — it only reads. This avoids conflicting with
 * `captureException`'s internal dedup which also calls `checkOrSetAlreadyCaught`
 * and would skip already-marked errors.
 */
export function isAlreadyCaptured(exception: unknown): boolean {
  try {
    return !!(exception as { __sentry_captured__?: boolean }).__sentry_captured__;
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
    const errorObj = error as { status?: number; statusCode?: number; type?: unknown };

    if (typeof errorObj.type === 'string' && errorObj.type === 'redirect') {
      return true;
    }

    const status = errorObj.status ?? errorObj.statusCode;
    if (typeof status === 'number' && status >= 300 && status < 400) {
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
    const errorObj = error as { status?: number; statusCode?: number; type?: unknown };

    if (typeof errorObj.type === 'string' && (errorObj.type === 'not-found' || errorObj.type === 'notFound')) {
      return true;
    }

    const status = errorObj.status ?? errorObj.statusCode;
    if (status === 404) {
      return true;
    }
  }

  return false;
}

/**
 * Safely flush events in serverless environments.
 * Uses fire-and-forget pattern to avoid swallowing original errors.
 */
export function safeFlushServerless(flushFn: () => Promise<void>): void {
  flushFn().catch(e => {
    DEBUG_BUILD && debug.warn('Failed to flush events in serverless environment', e);
  });
}
