import type { Integration } from '@sentry/core';
import { getClient, GLOBAL_OBJ } from '@sentry/core';

/**
 * Record a bundler-injected module and notify channel integrations. This is the
 * runtime target of the snippet the `tracingChannelImport` override splices
 * into every instrumented module (see `bundler/moduleInjectedTransform.ts`), so
 * it runs when that module is first evaluated — the moment its diagnostics
 * channels can start publishing.
 *
 * It records the module name on the global orchestrion marker, stores the
 * module's channel-subscriber integration factory (when the module has one)
 * keyed by module name, and emits the `orchestrion.module-injected` client
 * event. Recording happens BEFORE the emit so listeners triggered by the event
 * can read the marker.
 *
 * Deliberately record-and-emit only — no `addIntegration` here. Whether an
 * integration is *installed* is each SDK's policy: `@sentry/node` registers its
 * channel integrations statically and only needs the event to trigger their
 * lazy subscription (so a user who removed one from `integrations` stays opted
 * out), while a bundler-only SDK like `@sentry/cloudflare` instantiates the
 * stored factories at `init()` and listens for this event to pick up modules
 * that evaluate later (e.g. a lazily-required driver after a per-request
 * `init()` already snapshotted the marker).
 */
export function orchestrionModuleInjected(moduleName: string, integrationFn?: () => Integration): void {
  const marker = (GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ??= {});

  // Runtime guard, not just type narrowing: a banner from another SDK copy or
  // version may have written a non-array flag here; leave that untouched.
  if (marker.bundler === undefined || Array.isArray(marker.bundler)) {
    const bundler = (marker.bundler ??= []);
    if (!bundler.includes(moduleName)) {
      bundler.push(moduleName);
    }
  }

  if (integrationFn) {
    (marker.integrations ??= new Map()).set(moduleName, integrationFn);
  }

  getClient()?.emit('orchestrion.module-injected', moduleName);
}
