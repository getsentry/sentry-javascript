import { debug, GLOBAL_OBJ, parseSemver } from '@sentry/core';
import * as Module from 'node:module';
import { pathToFileURL } from 'node:url';
import { isMainThread, parentPort } from 'node:worker_threads';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import type { register } from 'node:module';
import ModulePatch from '@apm-js-collab/tracing-hooks';
import { initialize, load, resolve, createDiagnosticsPort } from '@apm-js-collab/tracing-hooks/hook-sync.mjs';
import { setDiagnosticsHook } from '@apm-js-collab/tracing-hooks/lib/diagnostics.js';

type NodeModule = {
  registerHooks?: (options: { load: Function; resolve: Function }) => { deregister: () => void };
  register?: typeof register;
};

export interface RegisterDiagnosticsChannelInjectionOptions {
  /**
   * Absolute directory of the `@apm-js-collab/tracing-hooks` package (forward slashes).
   *
   * Needed when SDK code is bundled into an app's server build: the default bare-specifier
   * require then resolves from the emitted chunk, which fails under isolated installs (pnpm).
   * Framework SDKs (e.g. `@sentry/nextjs`) resolve the package at build time and pass its
   * location here; it is loaded through an opaque `createRequire` that bundlers can't trace.
   */
  tracingHooksDir?: string;
}

/** `Module.registerHooks` only became stable in Node 24.13 / 25.1 and Deno 2.8. */
function hasStableSyncModuleHooks(denoVersionString: string | undefined): boolean {
  if (denoVersionString) {
    const { major = 0, minor = 0 } = parseSemver(denoVersionString);
    return major > 2 || (major === 2 && minor >= 8);
  }

  const { major = 0, minor = 0 } = parseSemver(process.versions.node ?? '0.0.0');
  return major > 25 || (major === 25 && minor >= 1) || (major === 24 && minor >= 13);
}

/**
 * Synchronously register the diagnostics-channel injection module hooks.
 *
 * This is the single source of truth for the registration logic. It is used by:
 * - `Sentry.init()` (the Node SDK calls it directly — that's why this module
 *   must be CJS-compatible / dual-built, so it can be `require()`d synchronously
 *   before the app's `import`s resolve), and
 * - `import-hook.mjs`, the side-effecting `--import` entry, which just calls it.
 *
 * Libraries imported *after* this call publish the `tracingChannel` events that
 * the channel-based integrations subscribe to.
 */
export function registerDiagnosticsChannelInjection(_options?: RegisterDiagnosticsChannelInjectionOptions): void {
  // Skip Node's internal loader (hooks) threads, recognizable as the only threads without a
  // `parentPort`. Node re-runs `--require` preloads (though not `--import` ones) on the loader
  // thread it spawns for `Module.register()`, so this function runs there too — but that thread
  // never executes app code, and its `register()` implementation (the in-thread `Hooks` class)
  // has no `transferList` parameter: our transfer array lands in its `isInternal` parameter and
  // Node crashes trying to load the hook as an internal builtin. User-created workers always
  // have a `parentPort` and register through `CustomizedModuleLoader`, which handles
  // `transferList` correctly, so they proceed and get their own instrumented loader.
  if (!isMainThread && !parentPort) {
    return;
  }

  if (GLOBAL_OBJ?.__SENTRY_ORCHESTRION__?.runtime) {
    return;
  }

  const globalAny = globalThis as { Bun?: unknown; Deno?: { version?: { deno?: string } } };
  const stableSyncHooks = hasStableSyncModuleHooks(globalAny.Deno?.version?.deno);

  // `Module.registerHooks` / `Module.register` are newer than the @types/node
  // we build against, hence the cast.
  const mod = Module as NodeModule;

  setDiagnosticsHook(({ moduleName, error }): void => {
    if (error) {
      debug.warn(`[orchestrion] failed to inject diagnostics-channel into ${moduleName}:`, error);
    } else {
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = GLOBAL_OBJ.__SENTRY_ORCHESTRION__ || {};
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime = GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime || [];
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime.push(moduleName);
    }
  });

  // runs both at `--import` time and (synchronously) inside `Sentry.init()`,
  // so an unguarded throw would either abort startup or make `init()` throw.
  // On any failure (e.g. dep resolution, `require(esm)` / Node-compat
  // incompatibility) we warn (DEBUG only) and continue without channel
  // injection
  try {
    if (typeof mod.registerHooks === 'function' && stableSyncHooks) {
      initialize({ instrumentations: SENTRY_INSTRUMENTATIONS });
      mod.registerHooks({ resolve, load });
      debug.log('Registered diagnostics-channel injection via Module.registerHooks()');
    } else if (typeof mod.register === 'function' && !globalAny.Bun && !globalAny.Deno) {
      // `Module.register` + the `_compile` patch is Node 18.19–24.12 / 25.0
      // path. Bun/Deno are excluded: they don't support this combination and
      // must use the stable `registerHooks` path above (or none at all).
      // `Module.register` resolves ESM-style: a bare package specifier is resolved against
      // `parentURL`, but a filesystem path (the `tracingHooksDir` override) is not a valid ESM
      // specifier and must be passed as a file:// URL.
      const diagnosticsPort = createDiagnosticsPort();

      let parentURL: string;
      /*! rollup-include-cjs-only */
      parentURL = pathToFileURL(__filename).href;
      /*! rollup-include-cjs-only-end */
      /*! rollup-include-esm-only */
      parentURL = import.meta.url;
      /*! rollup-include-esm-only-end */

      mod.register('@apm-js-collab/tracing-hooks/hook.mjs', {
        parentURL,
        data: { instrumentations: SENTRY_INSTRUMENTATIONS, diagnosticsPort },
        transferList: [diagnosticsPort],
      });

      // ALSO patch `Module.prototype._compile` for the CJS side: when an ESM
      // file `import`s a CJS package, the package's internal `require()` calls
      // are resolved through the CJS machinery and never reach the ESM
      // register hook, so without this patch the file we want to instrument
      // loads untransformed.
      new ModulePatch({ instrumentations: SENTRY_INSTRUMENTATIONS }).patch();
      debug.log('Registered diagnostics-channel injection via Module.register()');
    } else {
      debug.warn('No available Node API to register diagnostics-channel injection hooks; skipping.');
      return;
    }
  } catch (error) {
    debug.warn(
      'Failed to register diagnostics-channel injection hooks; channel-based integrations will not record spans.',
      error,
    );
    return;
  }

  GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = GLOBAL_OBJ.__SENTRY_ORCHESTRION__ || {};
  GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime = GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime || [];
}
