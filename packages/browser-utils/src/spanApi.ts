import type { Span, StartSpanOptions } from '@sentry/core';
/* oxlint-disable sdk/no-unguarded-span-apis -- This module IS the guarded browser variant: each wrapper
   installs `spanStreamingIntegration` via `ensureBrowserSpanStreaming` before delegating to the
   plain core API, which is exactly what browser-facing code is meant to go through. */
import {
  startInactiveSpan as coreStartInactiveSpan,
  startSpan as coreStartSpan,
  startSpanManual as coreStartSpanManual,
} from '@sentry/core';
/* oxlint-enable sdk/no-unguarded-span-apis */
import { ensureBrowserSpanStreaming } from './ensureBrowserSpanStreaming';

/**
 * Browser variants of the span-start APIs.
 *
 * These exist purely so that the span streaming integration is only reachable from code that can
 * actually start a span. `@sentry/browser`'s `init()` deliberately doesn't reference spanStreamingIntegration,
 * so error-only apps tree-shake the entire span streaming graph away without needing
 * the `__SENTRY_TRACING__` flag.
 */

/**
 * Wraps a function with a span and finishes the span after the function is done.
 *
 * See {@link startSpan} in `@sentry/core` for details.
 */
export function startSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T {
  ensureBrowserSpanStreaming();
  return coreStartSpan(options, callback);
}

/**
 * Similar to `startSpan`, but forces the span to be ended manually.
 *
 * See {@link startSpanManual} in `@sentry/core` for details.
 */
export function startSpanManual<T>(options: StartSpanOptions, callback: (span: Span, finish: () => void) => T): T {
  ensureBrowserSpanStreaming();
  return coreStartSpanManual(options, callback);
}

/**
 * Creates a span that is not set as active.
 *
 * See {@link startInactiveSpan} in `@sentry/core` for details.
 */
export function startInactiveSpan(options: StartSpanOptions): Span {
  ensureBrowserSpanStreaming();
  return coreStartInactiveSpan(options);
}
