import type { Client } from '../client';
import { getClient } from '../currentScopes';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean | undefined;

/**
 * Determines if the SDK is configured for span streaming.
 * Span streaming is enabled when `traceLifecycle` is set to `stream`.
 * (In Browser, users must add `spanStreamingIntegration` as well but it
 * already checks itself and configures `traceLifecycle` appropriately)
 */
export function hasSpanStreamingEnabled(maybeClient: Client | undefined = getClient()): boolean {
  if (typeof __SENTRY_TRACING__ === 'boolean' && !__SENTRY_TRACING__) {
    return false;
  }
  return (maybeClient ?? getClient())?.getOptions()?.traceLifecycle === 'stream';
}
