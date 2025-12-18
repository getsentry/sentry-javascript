import { captureException, debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { InstrumentationResult } from './types';

/**
 * Extracts pathname from request URL.
 * Falls back to '<unknown>' with DEBUG warning if URL cannot be parsed.
 */
export function getPathFromRequest(request: { url: string }): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    try {
      // Fallback: use a dummy base URL since we only care about the pathname
      return new URL(request.url, 'http://example.com').pathname;
    } catch (error) {
      DEBUG_BUILD && debug.warn('Failed to parse URL from request:', request.url, error);
      return '<unknown>';
    }
  }
}

/**
 * Extracts route pattern from instrumentation info.
 * Prefers `pattern` (planned for v8) over `unstable_pattern` (v7.x).
 */
export function getPattern(info: { pattern?: string; unstable_pattern?: string }): string | undefined {
  return info.pattern ?? info.unstable_pattern;
}

/**
 * Normalizes route path by ensuring it starts with a slash.
 * Returns undefined if the input is falsy.
 */
export function normalizeRoutePath(pattern?: string): string | undefined {
  if (!pattern) {
    return undefined;
  }
  return pattern.startsWith('/') ? pattern : `/${pattern}`;
}

/**
 * Captures an error from instrumentation result if conditions are met.
 * Used by both client and server instrumentation to avoid duplication.
 *
 * Only captures actual Error instances - Response objects and ErrorResponse
 * are expected control flow in React Router (redirects, 404s, etc).
 */
export function captureInstrumentationError(
  result: InstrumentationResult,
  captureErrors: boolean,
  mechanismType: string,
  data: Record<string, unknown>,
): void {
  if (result.status === 'error' && captureErrors && isError(result.error)) {
    captureException(result.error, {
      mechanism: {
        type: mechanismType,
        handled: false,
      },
      data,
    });
  }
}

/**
 * Checks if value is an Error instance.
 * Response objects and ErrorResponse are not errors - they're expected control flow.
 */
function isError(value: unknown): value is Error {
  return value instanceof Error;
}
