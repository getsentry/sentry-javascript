import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__: { runtime?: boolean; bundler?: boolean } | undefined;
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
