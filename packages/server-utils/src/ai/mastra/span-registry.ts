import type { Span } from '@sentry/core';

/**
 * Maps a Mastra span id to the Sentry span the exporter opened for it, so the `executeWithContext`
 * channel subscriber can make that span active for the operation's work (see `integrations/mastra.ts`).
 * The exporter is the sole writer and keeps this in lockstep with its own tracked spans (bounded by the
 * exporter's LRU), so entries never outlive the span they point at.
 */
const spansByMastraId = new Map<string, Span>();

export function registerMastraSpan(mastraId: string, span: Span): void {
  spansByMastraId.set(mastraId, span);
}

export function unregisterMastraSpan(mastraId: string): void {
  spansByMastraId.delete(mastraId);
}

export function getSentrySpanForMastraId(mastraId: string): Span | undefined {
  return spansByMastraId.get(mastraId);
}
