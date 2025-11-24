import type { Span, StartSpanOptions } from '@sentry/core';
import {
  SentryNonRecordingSpan,
  startInactiveSpan as coreStartInactiveSpan,
  startSpan as coreStartSpan,
  startSpanManual as coreStartSpanManual,
} from '@sentry/core';

/**
 * Check if we're currently in a Next.js Cache Components context.
 * Cache Components are rendered during the production build phase.
 *
 * @returns true if we're in a Cache Components context, false otherwise
 * // todo: This is a heuristic check, we should use a more reliable way to detect a Cache Components context once Vercel exposes it.
 */
function isCacheComponentContext(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

/**
 * Next.js-specific implementation of `startSpan` that skips span creation
 * in Cache Components contexts (which render at build time).
 *
 * When in a Cache Components context, we execute the callback with a non-recording span
 * and return early without creating an actual span, since spans don't make sense at build time.
 *
 * @param options - Options for starting the span
 * @param callback - Callback function that receives the span
 * @returns The return value of the callback
 */
export function startSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T {
  if (isCacheComponentContext()) {
    // Cache Components render at build time, so spans don't make sense
    // Execute callback with a non-recording span (no crypto calls) and return early
    // Use placeholder IDs since this span won't be sent to Sentry anyway
    const nonRecordingSpan = new SentryNonRecordingSpan({
      traceId: '00000000000000000000000000000000',
      spanId: '0000000000000000',
    });
    return callback(nonRecordingSpan);
  }

  return coreStartSpan(options, callback);
}

/**
 *
 * When in a Cache Components context, we execute the callback with a non-recording span
 * and return early without creating an actual span, since spans don't make sense at build time.
 *
 * @param options - Options for starting the span
 * @param callback - Callback function that receives the span and finish function
 * @returns The return value of the callback
 */
export function startSpanManual<T>(options: StartSpanOptions, callback: (span: Span, finish: () => void) => T): T {
  if (isCacheComponentContext()) {
    // Cache Components render at build time, so spans don't make sense
    // Execute callback with a non-recording span (no crypto calls) and return early
    // Use placeholder IDs since this span won't be sent to Sentry anyway
    const nonRecordingSpan = new SentryNonRecordingSpan({
      traceId: '00000000000000000000000000000000',
      spanId: '0000000000000000',
    });
    return callback(nonRecordingSpan, () => nonRecordingSpan.end());
  }

  return coreStartSpanManual(options, callback);
}

/**
 *
 * When in a Cache Components context, we return a non-recording span and return early
 * without creating an actual span, since spans don't make sense at build time.
 *
 * @param options - Options for starting the span
 * @returns A non-recording span (in Cache Components context) or the created span
 */
export function startInactiveSpan(options: StartSpanOptions): Span {
  if (isCacheComponentContext()) {
    // Cache Components render at build time, so spans don't make sense
    // Return a non-recording span (no crypto calls) and return early
    // Use placeholder IDs since this span won't be sent to Sentry anyway
    return new SentryNonRecordingSpan({
      traceId: '00000000000000000000000000000000',
      spanId: '0000000000000000',
    });
  }

  return coreStartInactiveSpan(options);
}
