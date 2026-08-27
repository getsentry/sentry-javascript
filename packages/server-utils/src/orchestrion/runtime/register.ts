import { consoleSandbox, debug, getClient, GLOBAL_OBJ, parseSemver } from '@sentry/core';
import * as Module from 'node:module';
import { pathToFileURL } from 'node:url';
import { create } from '@apm-js-collab/code-transformer';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import type { register } from 'node:module';
import ModulePatch from '@apm-js-collab/tracing-hooks';
import { initialize, load, resolve, createDiagnosticsPort } from '@apm-js-collab/tracing-hooks/hook-sync.mjs';
import { setDiagnosticsHook } from '@apm-js-collab/tracing-hooks/lib/diagnostics.js';

type NodeModule = {
  registerHooks?: (options: { load: Function; resolve: Function }) => { deregister: () => void };
  register?: typeof register;
};

// Surfaced in the always-on warnings below so users can find the fix.
const BUNDLING_DOCS_URL = 'https://docs.sentry.io/platforms/javascript/guides/node/troubleshooting/';

/** `Module.registerHooks` only became stable in Node 24.13 / 25.1. */
function hasStableSyncModuleHooks(isDeno: boolean): boolean {
  // The minimum supported Deno (2.8.3) always has stable sync module hooks.
  if (isDeno) {
    return true;
  }

  const { major = 0, minor = 0 } = parseSemver(process.versions.node ?? '0.0.0');
  return major > 25 || (major === 25 && minor >= 1) || (major === 24 && minor >= 13);
}

/**
 * Detect whether the vendored code-transformer chain (meriyah/astring/source-map, bundled into this
 * package) survived downstream bundling.
 *
 * This package ships the transformer inline and is meant to run from `node_modules` (external). When
 * an app bundler instead inlines `@sentry/server-utils` and tree-shakes it, those vendored deps are
 * stripped to empty objects, so `parse`/`generate` become `undefined` and the FIRST module the hook
 * tries to transform throws `TypeError: parse is not a function` — deep in the loader, once per
 * module, only visible with `debug: true`. Running one throwaway in-memory transform up front turns
 * that into a single, actionable, always-on warning (see `warnRuntimeUnavailable`). A healthy build
 * returns normally; a tree-shaken one throws a `TypeError`.
 */
function isTransformerTreeShaken(): boolean {
  try {
    create(
      [
        {
          channelName: 'probe',
          module: { name: '@sentry/orchestrion-probe', versionRange: '*', filePath: 'probe.js' },
          functionQuery: { className: 'C', methodName: 'm', kind: 'Async' },
        },
      ],
      'node:diagnostics_channel',
    )
      .getTransformer('@sentry/orchestrion-probe', '0.0.0', 'probe.js')
      ?.transform('class C { async m(x) { return x; } }', 'esm');
    return false;
  } catch (error) {
    // Tree-shaken: `parse`/`generate`/`create` are `undefined` → TypeError. A healthy build either
    // succeeds or throws a domain `Error` (e.g. "Failed to find injection points"), never a TypeError.
    return error instanceof TypeError;
  }
}

/**
 * Emit a single, always-on warning that runtime channel injection is disabled, with the actionable
 * fix. Unlike `debug.warn` (gated behind `debug: true`), this reaches every user — otherwise the
 * SDK silently records no channel-based spans. Deduped via a global marker so repeat calls (e.g.
 * `init()` plus `--import`) warn at most once.
 */
function warnRuntimeUnavailable(message: string): void {
  consoleSandbox(() => {
    GLOBAL_OBJ.console?.warn(`[Sentry] ${message} See ${BUNDLING_DOCS_URL}`);
  });
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
export function registerDiagnosticsChannelInjection(): void {
  const marker = (GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ??= {});

  // Already hooked, or we already ran and found runtime injection unavailable (and warned once).
  if (marker.runtime || marker.runtimeUnavailable) {
    return;
  }

  // A downstream bundler that inlined + tree-shook this package strips the vendored transformer, so
  // every runtime transform would throw a cryptic `TypeError` deep in the loader. Detect that once
  // and don't install hooks that can't work.
  if (isTransformerTreeShaken()) {
    marker.runtimeUnavailable = true;
    // If the build-time bundler plugin ran (a defined `bundler` marker Set, set by its entry banner),
    // instrumentation was already injected at build time and the runtime hook is redundant — this is
    // an expected, supported setup, so stay quiet (debug-only). Otherwise nothing is instrumented, so
    // surface an always-on, actionable warning.
    if (marker.bundler instanceof Set) {
      debug.log(
        'Runtime diagnostics-channel injection is disabled because `@sentry/server-utils` was bundled; ' +
          'build-time instrumentation is active, so this is expected.',
      );
    } else {
      warnRuntimeUnavailable(
        '`@sentry/server-utils` was bundled into your application, so diagnostics-channel ' +
          'auto-instrumentation is disabled. Keep `@sentry/server-utils` external in your server bundle, ' +
          'or use the Sentry bundler plugin for build-time instrumentation.',
      );
    }
    return;
  }

  const globalAny = globalThis as { Bun?: unknown; Deno?: { version?: { deno?: string } } };
  const stableSyncHooks = hasStableSyncModuleHooks(Boolean(globalAny.Deno));

  // `Module.registerHooks` / `Module.register` are newer than the @types/node
  // we build against, hence the cast.
  const mod = Module as NodeModule;

  setDiagnosticsHook(({ moduleName, error }): void => {
    if (error) {
      debug.warn(`[instrumentation] failed to inject diagnostics-channel into ${moduleName}:`, error);
    } else {
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = GLOBAL_OBJ.__SENTRY_ORCHESTRION__ || {};
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime = GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime || [];
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime.push(moduleName);
      // Tell channel integrations their module just loaded, so they subscribe
      // now. They hold off at `init()` to avoid claiming channel slots for
      // modules that never load, because Node caps channels in use at 1024.
      getClient()?.emit('orchestrion.module-injected', moduleName);
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
      const diagnosticsPort = createDiagnosticsPort();

      let parentURL: string;
      /*! rollup-include-cjs-only */
      parentURL = pathToFileURL(__filename).href;
      /*! rollup-include-cjs-only-end */
      /*! rollup-include-esm-only */
      parentURL = import.meta.url;
      /*! rollup-include-esm-only-end */

      // Our own bundled copy of the tracing-hooks async hooks (see
      // `src/orchestrion/runtime/hook.mjs`) — the dependency itself is bundled into this package's
      // build and no longer resolvable as a bare specifier at runtime.
      mod.register('@sentry/server-utils/orchestrion/hook', {
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
      marker.runtimeUnavailable = true;
      debug.warn('No available Node API to register diagnostics-channel injection hooks; skipping.');
      return;
    }
  } catch (error) {
    marker.runtimeUnavailable = true;
    warnRuntimeUnavailable(
      'Failed to register diagnostics-channel injection hooks, so channel-based integrations will not record spans.',
    );
    debug.warn('Diagnostics-channel injection registration error:', error);
    return;
  }

  marker.runtime = marker.runtime || [];
}
