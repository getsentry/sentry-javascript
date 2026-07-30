import type { Integration } from '@sentry/core';
import { getClient, GLOBAL_OBJ } from '@sentry/core';

/**
 * Register an orchestrion channel-subscriber integration from an instrumented
 * module. This is the runtime target of the snippet the subscribe-injection
 * transform splices into each transformed package (see
 * `bundler/subscribeInjection.ts`), so a bundler-only SDK (e.g.
 * `@sentry/cloudflare`, running in workerd where requires can't be
 * monkey-patched) wires up subscribers with no runtime module hook.
 *
 * It does two things, covering the two disjoint timing cases:
 *
 * 1. Stores the factory on the global orchestrion marker under `name`, so a
 *    later `init()` (a fresh isolate, or a client created after this module
 *    loads) picks it up via `getDefaultIntegrations()`.
 * 2. If a client already exists, registers the integration on it right away.
 *    This is what makes the mechanism robust against module load order:
 *    bundler-only SDKs call `init()` per request, but a package like `mysql`
 *    loads its instrumented file lazily on first use, i.e. AFTER that request's
 *    `init()` already snapshotted the marker. Without the live add, the first
 *    request that touches such a package would publish to a channel nobody
 *    subscribed to yet.
 *
 * `addIntegration` dedupes by integration name and only runs `setupOnce` once,
 * so storing AND live-adding never double-subscribes.
 *
 * The marker is a `Map` keyed by `name` (the factory's export name) so a package
 * split across several instrumented files (e.g. `pg`'s JS and native clients, or
 * openai's per-resource `.js`/`.mjs` files) registers its one subscriber once,
 * no matter how many of its files land in the bundle. `.set` on the shared key
 * is idempotent.
 */
export function registerOrchestrionChannelIntegration(name: string, integrationFn: () => Integration): void {
  const marker = (GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ??= {});
  (marker.integrations ??= new Map()).set(name, integrationFn);
  getClient()?.addIntegration(integrationFn());
}
