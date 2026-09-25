import type { Span } from '@sentry/core';
import { LRUMap } from '@sentry/core';
import { MAX_TRACKED_MASTRA_SPANS } from './constants';

/**
 * Maps a Mastra span id to the Sentry span the exporter opened for it, so the `executeWithContext`
 * channel subscriber can make that span active for the operation's work (see `integrations/mastra.ts`).
 *
 * Keyed by Mastra span id (globally unique), so it works across multiple `Mastra` instances / exporters
 * — each registers and unregisters its own spans. It's an `LRUMap` rather than a plain `Map` so the
 * process-wide table stays bounded even if an `unregister` is ever missed (a dropped entry only means a
 * nested span won't reparent — it degrades, it can't leak).
 */
const spansByMastraId = new LRUMap<string, Span>(MAX_TRACKED_MASTRA_SPANS);

export function registerMastraSpan(mastraId: string, span: Span): void {
  spansByMastraId.set(mastraId, span);
}

export function unregisterMastraSpan(mastraId: string): void {
  spansByMastraId.remove(mastraId);
}

export function getSentrySpanForMastraId(mastraId: string): Span | undefined {
  return spansByMastraId.get(mastraId);
}
