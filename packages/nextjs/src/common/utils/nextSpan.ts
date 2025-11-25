import type { Span, StartSpanOptions } from '@sentry/core';
import {
  debug,
  SentryNonRecordingSpan,
  startInactiveSpan as coreStartInactiveSpan,
  startSpan as coreStartSpan,
  startSpanManual as coreStartSpanManual,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { isBuild } from './isBuild';
import type { ServerReference } from './isUseCacheFunction';
import { isUseCacheFunction } from './isUseCacheFunction';

function shouldNoopSpan<T>(callback?: T & Partial<ServerReference>): boolean {
  const isBuildContext = isBuild();
  const isUseCacheFunctionContext = callback ? isUseCacheFunction(callback) : false;

  if (isUseCacheFunctionContext) {
    DEBUG_BUILD && debug.log('Skipping span creation in Cache Components context');
  }

  return isBuildContext || isUseCacheFunctionContext;
}

function createNonRecordingSpan(): Span {
  return new SentryNonRecordingSpan({
    traceId: '00000000000000000000000000000000',
    spanId: '0000000000000000',
  });
}

/**
 * Next.js-specific implementation of `startSpan` that skips span creation
 * in Cache Components contexts (which render at build time).
 *
 * When in a Cache Components context, we execute the callback with a non-recording span
 * and return early without creating an actual span, since spans don't make sense at build/cache time.
 *
 * @param options - Options for starting the span
 * @param callback - Callback function that receives the span
 * @returns The return value of the callback
 */
export function startSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T {
  if (shouldNoopSpan(callback)) {
    return callback(createNonRecordingSpan());
  }

  return coreStartSpan(options, callback);
}

/**
 *
 * When in a Cache Components context, we execute the callback with a non-recording span
 * and return early without creating an actual span, since spans don't make sense at build/cache time.
 *
 * @param options - Options for starting the span
 * @param callback - Callback function that receives the span and finish function
 * @returns The return value of the callback
 */
export function startSpanManual<T>(options: StartSpanOptions, callback: (span: Span, finish: () => void) => T): T {
  if (shouldNoopSpan(callback)) {
    const nonRecordingSpan = createNonRecordingSpan();
    return callback(nonRecordingSpan, () => nonRecordingSpan.end());
  }

  return coreStartSpanManual(options, callback);
}

/**
 *
 * When in a Cache Components context, we return a non-recording span and return early
 * without creating an actual span, since spans don't make sense at build/cache time.
 *
 * @param options - Options for starting the span
 * @returns A non-recording span (in Cache Components context) or the created span
 */
export function startInactiveSpan(options: StartSpanOptions): Span {
  if (shouldNoopSpan()) {
    return createNonRecordingSpan();
  }

  return coreStartInactiveSpan(options);
}
