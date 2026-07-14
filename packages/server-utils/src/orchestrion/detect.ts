import type { Integration } from '@sentry/core';
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__:
    | {
        runtime?: boolean;
        bundler?: boolean;
        integrations?: Array<{ factory: () => Integration; modules: string[] }>;
        transformedModules?: string[];
        failedModules?: string[];
      }
    | undefined;
}

/**
 * Whether orchestrion has injected the diagnostics channels into this process,
 * either by the runtime `--import` hook / init-time registration (`runtime`)
 * or a bundler plugin (`bundler`). Both injectors set a flag on the
 * `globalThis.__SENTRY_ORCHESTRION__` marker.
 *
 * Use this to avoid wiring up channel-subscriber integrations when nothing
 * will ever publish to those channels.
 */
export function isOrchestrionInjected(): boolean {
  const marker = globalThis.__SENTRY_ORCHESTRION__;
  return !!(marker?.runtime || marker?.bundler);
}

/**
 * Returns fresh instances of the channel-subscriber integrations an injector
 * registered on the global marker (e.g. the registration module that the
 * `@sentry/cloudflare/vite` plugin injects into the worker bundle).
 *
 * SDKs that can't afford to ship the subscriber code unconditionally read the
 * registry through this function instead of importing the integrations: no
 * static import means bundlers drop the integration code entirely unless the
 * injector put its registration module — and with it the integrations — into
 * the bundle.
 *
 * When the injector also recorded which modules were transformed (the
 * `transformedModules` list the code transformer's `injectDiagnostics` hook
 * emits onto the marker), only integrations whose module was actually
 * transformed are activated — so an app that bundles `postgres` but not
 * `mysql` never wires up the mysql subscriber. If no such list is present
 * (an injector that doesn't emit diagnostics), every registered integration is
 * returned, preserving the prior behavior.
 */
export function getRegisteredChannelIntegrations(): Integration[] {
  const marker = globalThis.__SENTRY_ORCHESTRION__;
  const registered = marker?.integrations || [];
  const transformedModules = marker?.transformedModules;

  warnAboutFailedModules(marker?.failedModules);

  if (!transformedModules) {
    return registered.map(entry => entry.factory());
  }

  return registered
    .filter(entry => entry.modules.some(module => transformedModules.includes(module)))
    .map(entry => entry.factory());
}

// A failed transform means the package is in the bundle but its diagnostics
// channels are not, so its integration is filtered out and spans silently go
// missing. Surface why (the bundler plugin also warns at build time). The
// failed-modules list is fixed at build time, but this runs on every
// `Sentry.init()` — which in Cloudflare is once per request — so remember which
// packages we've already warned about and warn once per isolate instead of on
// every request.
const warnedFailedModules = new Set<string>();

function warnAboutFailedModules(failedModules: string[] | undefined): void {
  if (!DEBUG_BUILD || !failedModules?.length) return;

  const unwarned = failedModules.filter(module => !warnedFailedModules.has(module));
  if (!unwarned.length) return;

  unwarned.forEach(module => warnedFailedModules.add(module));
  debug.warn(
    `[Sentry] The orchestrion code transform failed at build time for: ${unwarned.join(', ')}. ` +
      'No spans will be recorded for these packages.',
  );
}

/**
 * Verifies that the diagnostics channels have been injected either by the
 * runtime `--import` hook (or init-time registration), a bundler plugin, or
 * both, and warns if not.
 *
 * Both injectors being active at once is fine: they operate on disjoint module
 * sets (a module is either loaded through Node's loader and transformed by the
 * runtime hook, or inlined by the bundler and transformed by the plugin), so
 * a single module can't be double-wrapped. A hybrid setup, with some deps
 * external and runtime-instrumented, others bundled and plugin-instrumented,
 * is fine.
 *
 * Note: intentionally does NOT warn in production, only in debug builds,
 * because production warnings are reserved for truly critical issues.
 */
export function detectOrchestrionSetup(): void {
  if (!DEBUG_BUILD) return;

  const marker = globalThis.__SENTRY_ORCHESTRION__;
  const runtime = !!marker?.runtime;
  const bundler = !!marker?.bundler;

  DEBUG_BUILD && debug.log(`[orchestrion] detect: runtime=${runtime} bundler=${bundler}`);

  if (!isOrchestrionInjected()) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] No diagnostics-channel injection detected. Channel-based integrations ' +
          '(mysql, …) will not record spans. Make sure the diagnostics channels are injected ' +
          'via the runtime `--import` hook or a bundler plugin before the instrumented modules load.',
      );
  }
}
