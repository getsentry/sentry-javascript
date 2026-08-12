import { debug, GLOBAL_OBJ } from '@sentry/core';

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
  const marker = GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  return !!(marker?.runtime || marker?.bundler || marker?.integrations);
}

/**
 * The module names (e.g. `mysql`, `@hapi/hapi`) orchestrion has already injected
 * into this process — from the runtime `--import` hook (`runtime`) and/or the
 * snippets a bundler transform spliced into each transformed module (`bundler`).
 * Channel-based integrations use it to decide whether to subscribe now (their
 * module is already loaded) or wait for the module-injected event.
 *
 * The `Array.isArray` guard is runtime safety, not typing: a banner from
 * another SDK copy or version may have written a non-array flag here.
 */
export function getOrchestrionInjectedModules(): string[] {
  const { runtime, bundler } = GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ?? {};
  return [...(runtime ?? []), ...(Array.isArray(bundler) ? bundler : [])];
}

/**
 * Verifies that the diagnostics channels have been injected either by the
 * runtime `--import` hook (or init-time registration), a bundler plugin, or
 * both, and warns if not. When at least one injector is active, logs for each
 * mechanism whether it hooked (a defined array, even empty, means it did) and
 * which libraries it injected. For the bundler path, the entry banner ensures
 * `[]` at boot; module names arrive as each transformed module is evaluated,
 * so an empty list can also just mean none has loaded yet.
 *
 * Both injectors being active at once is fine: they operate on disjoint module
 * sets (a module is either loaded through Node's loader and transformed by the
 * runtime hook, or inlined by the bundler and transformed by the plugin), so
 * a single module can't be double-wrapped. A hybrid setup, with some deps
 * external and runtime-instrumented, others bundled and plugin-instrumented,
 * is fine.
 */
export function detectOrchestrionSetup(): void {
  const { runtime, bundler } = GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ?? {};

  if (!runtime && !bundler) {
    debug.warn(
      '[Sentry] No diagnostics-channel injection detected. Channel-based integrations ' +
        'will not record spans. Make sure the diagnostics channels are injected ' +
        'via the runtime `--import` hook or a bundler plugin before the instrumented modules load.',
    );
    return;
  }

  debug.log(
    runtime
      ? `[Sentry] Runtime hook registered, injected libraries=${JSON.stringify(runtime)}`
      : '[Sentry] Runtime hook not registered',
  );
  debug.log(
    bundler
      ? `[Sentry] Bundler plugin ran, injected libraries=${JSON.stringify(bundler)}`
      : '[Sentry] Bundler plugin did not run',
  );
}
