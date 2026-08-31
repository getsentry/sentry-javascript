import type { Client } from '@sentry/core';
import { getClient, hasSpanStreamingEnabled, spanStreamingIntegration } from '@sentry/core';

/**
 * The span streaming integration is only reachable from code that can actually start a span.
 * `@sentry/browser`'s `init()` deliberately doesn't reference it, so error-only apps tree-shake the
 * entire span streaming graph away without needing the `__SENTRY_TRACING__` flag. The guarded browser
 * span-start APIs call this before starting a span.
 */

const clientsWithIntegration = new WeakSet<Client>();

/**
 * Lazily install the browser span streaming integration.
 *
 * Defaults to the current client; pass one explicitly from integration hooks, where the client being
 * set up isn't necessarily the current one.
 *
 */
export function ensureBrowserSpanStreaming(client: Client | undefined = getClient()): void {
  // The `WeakSet` is an allocation optimization, not a semantic gate — `addIntegration()` is already
  // idempotent by integration name, including against a user-supplied instance.
  if (!client || clientsWithIntegration.has(client) || !hasSpanStreamingEnabled(client)) {
    return;
  }

  clientsWithIntegration.add(client);
  client.addIntegration(spanStreamingIntegration());
}
