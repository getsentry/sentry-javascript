import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { spanStreamingIntegration } from '../integrations/browserSpanStreaming';
import type { Span } from '../types/span';
import type { StartSpanOptions } from '../types/startSpanOptions';
import { startIdleSpan as coreStartIdleSpan } from './idleSpan';
import { hasSpanStreamingEnabled } from './spans/hasSpanStreamingEnabled';
import {
  startInactiveSpan as coreStartInactiveSpan,
  startSpan as coreStartSpan,
  startSpanManual as coreStartSpanManual,
} from './trace';

/**
 * Browser variants of the span-start APIs.
 *
 * These exist purely so that the span streaming integration is only reachable from code that can
 * actually start a span. `@sentry/browser`'s `init()` deliberately doesn't reference spanStreamingIntegration,
 * so error-only apps tree-shake the entire span streaming graph away without needing
 * the `__SENTRY_TRACING__` flag.
 *
 * The names deliberately match the core originals: `@sentry/core/browser` serves these guarded
 * variants, `@sentry/core` serves the plain ones, so browser-facing packages upgrade by changing
 * only the import specifier.
 */

const installed = new WeakSet<Client>();

/**
 * Lazily install the browser span streaming integration.
 *
 * Defaults to the current client; pass one explicitly from integration hooks, where the client being
 * set up isn't necessarily the current one.
 *
 * @internal
 */
export function _INTERNAL_ensureBrowserSpanStreaming(client: Client | undefined = getClient()): void {
  // The `WeakSet` is an allocation optimization, not a semantic gate — `addIntegration()` is already
  // idempotent by integration name, including against a user-supplied instance.
  if (!client || installed.has(client) || !hasSpanStreamingEnabled(client)) {
    return;
  }

  installed.add(client);
  client.addIntegration(spanStreamingIntegration());
}

/**
 * Wraps a function with a span and finishes the span after the function is done.
 *
 * See {@link startSpan} in `@sentry/core` for details.
 */
export function startSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T {
  _INTERNAL_ensureBrowserSpanStreaming();
  return coreStartSpan(options, callback);
}

/**
 * Similar to `startSpan`, but forces the span to be ended manually.
 *
 * See {@link startSpanManual} in `@sentry/core` for details.
 */
export function startSpanManual<T>(options: StartSpanOptions, callback: (span: Span, finish: () => void) => T): T {
  _INTERNAL_ensureBrowserSpanStreaming();
  return coreStartSpanManual(options, callback);
}

/**
 * Creates a span that is not set as active.
 *
 * See {@link startInactiveSpan} in `@sentry/core` for details.
 */
export function startInactiveSpan(options: StartSpanOptions): Span {
  _INTERNAL_ensureBrowserSpanStreaming();
  return coreStartInactiveSpan(options);
}

/**
 * Starts an idle span that automatically ends once no activity happens for a while.
 *
 * See {@link startIdleSpan} in `@sentry/core` for details.
 *
 * Typed via `typeof` because `IdleSpanOptions` is intentionally not part of the public type surface,
 * and re-declaring the signature here would have to widen it.
 */
export const startIdleSpan: typeof coreStartIdleSpan = (startSpanOptions, options) => {
  _INTERNAL_ensureBrowserSpanStreaming();
  return coreStartIdleSpan(startSpanOptions, options);
};
