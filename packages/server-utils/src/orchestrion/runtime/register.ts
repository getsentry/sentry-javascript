import { consoleSandbox, debug, getClient, GLOBAL_OBJ, parseSemver } from '@sentry/core';
import * as Module from 'node:module';
import { pathToFileURL } from 'node:url';
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
 * Emit a single, always-on warning that runtime channel injection is disabled, with the actionable
 * fix. Unlike `debug.warn` (gated behind `debug: true`), this reaches every user — otherwise the
 * SDK silently records no channel-based spans.
 */
function warnRuntimeUnavailable(message: string): void {
  consoleSandbox(() => {
    // oxlint-disable-next-line no-console
    console.warn(`[Sentry] ${message} See ${BUNDLING_DOCS_URL}`);
  });
}

// One broken transformer breaks every module, so state the fix once.
let warnedTransformerUnavailable = false;

/**
 * Warn that the vendored code transformer could not run, so `moduleName` loaded uninstrumented.
 *
 * This package ships the transformer (meriyah/astring/source-map) inline and is meant to run from
 * `node_modules`. A bundler that inlines and tree-shakes `@sentry/server-utils` strips it, so every
 * transform throws `TypeError: parse is not a function` — swallowed inside the loader, once per
 * module, visible only with `debug: true`.
 *
 * Warning from here rather than probing the transformer at `init()` keeps the check honest. A
 * module only reaches this callback by coming through Node's loader, which means the build-time
 * bundler plugin did not cover it, which means the instrumentation really is lost. Probing at
 * `init()` instead has to guess at that from a global the plugin's entry banner may not have
 * written yet.
 */
function warnTransformerUnavailable(moduleName: string): void {
  if (warnedTransformerUnavailable) {
    return;
  }
  warnedTransformerUnavailable = true;

  warnRuntimeUnavailable(
    `\`@sentry/server-utils\` was bundled into your application, so ${moduleName} and any other ` +
      'instrumented dependency load uninstrumented. Keep `@sentry/server-utils` external in your ' +
      'server bundle, or use the Sentry bundler plugin for build-time instrumentation.',
  );
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

  const globalAny = globalThis as { Bun?: unknown; Deno?: { version?: { deno?: string } } };
  const stableSyncHooks = hasStableSyncModuleHooks(Boolean(globalAny.Deno));

  // `Module.registerHooks` / `Module.register` are newer than the @types/node
  // we build against, hence the cast.
  const mod = Module as NodeModule;

  setDiagnosticsHook(({ moduleName, error }): void => {
    if (error) {
      // A stripped transformer surfaces as a `TypeError` (`parse`/`generate` are `undefined`) and
      // costs the user this module's instrumentation, so it is worth an always-on warning. Every
      // other transform failure stays debug-only.
      if (error instanceof TypeError) {
        warnTransformerUnavailable(moduleName);
      }
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
  // incompatibility) we warn and continue without channel injection.
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
