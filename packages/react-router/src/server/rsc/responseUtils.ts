import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';

/**
 * WeakSet to track errors that have been captured to avoid double-capture.
 * Uses WeakSet so errors are automatically removed when garbage collected.
 */
const CAPTURED_ERRORS = new WeakSet<object>();

/**
 * Check if an error has already been captured by Sentry.
 * Only works for object errors - primitives always return false.
 */
export function isErrorCaptured(error: unknown): boolean {
  return error !== null && typeof error === 'object' && CAPTURED_ERRORS.has(error);
}

/**
 * Mark an error as captured to prevent double-capture.
 * Only marks object errors - primitives are silently ignored.
 */
export function markErrorAsCaptured(error: unknown): void {
  if (error !== null && typeof error === 'object') {
    CAPTURED_ERRORS.add(error);
  }
}

/**
 * Check if an error/response is a redirect.
 * React Router uses Response objects for redirects (3xx status codes).
 */
export function isRedirectResponse(error: unknown): boolean {
  if (error instanceof Response) {
    const status = error.status;
    // 3xx status codes are redirects (301, 302, 303, 307, 308, etc.)
    return status >= 300 && status < 400;
  }

  // Check for redirect-like objects (internal React Router throwables)
  if (error && typeof error === 'object') {
    const errorObj = error as { status?: number; statusCode?: number; type?: unknown };

    // Check for explicit redirect type (React Router internal)
    if (typeof errorObj.type === 'string' && errorObj.type === 'redirect') {
      return true;
    }

    // Check for redirect status codes
    const status = errorObj.status ?? errorObj.statusCode;
    if (typeof status === 'number' && status >= 300 && status < 400) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an error/response is a not-found response (404).
 */
export function isNotFoundResponse(error: unknown): boolean {
  if (error instanceof Response) {
    return error.status === 404;
  }

  // Check for not-found-like objects (internal React Router throwables)
  if (error && typeof error === 'object') {
    const errorObj = error as { status?: number; statusCode?: number; type?: unknown };

    // Check for explicit not-found type (React Router internal)
    if (typeof errorObj.type === 'string' && (errorObj.type === 'not-found' || errorObj.type === 'notFound')) {
      return true;
    }

    // Check for 404 status code
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
