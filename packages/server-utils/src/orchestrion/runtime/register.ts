import { debug } from '@sentry/core';
import { createRequire } from 'node:module';
import * as Module from 'node:module';
import { pathToFileURL } from 'node:url';
import { DEBUG_BUILD } from '../../debug-build';
import { SENTRY_INSTRUMENTATIONS } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__: { runtime?: boolean; bundler?: boolean } | undefined;
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
 *
 * Idempotent via `globalThis.__SENTRY_ORCHESTRION__` — a no-op if the runtime
 * `--import` hook or a bundler plugin already injected the channels.
 */
export function registerDiagnosticsChannelInjection(): void {
  const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});

  // Already injected (runtime --import hook or bundler plugin) — nothing to do.
  if (g.runtime || g.bundler) {
    return;
  }

  const globalAny = globalThis as { Bun?: unknown; Deno?: { version?: { deno?: string } } };
  const parseVersion = (v: string): number[] => v.split('.').map(n => parseInt(n, 10));
  const nodeVersion = parseVersion(process.versions.node ?? '0.0.0');
  const denoVersion = parseVersion(globalAny.Deno?.version?.deno ?? '0.0.0');
  // `Module.registerHooks` only became stable in Node 24.13 / 25.1 and Deno 2.8.
  const stableSyncHooks =
    (nodeVersion[0] ?? 0) > 25 ||
    (nodeVersion[0] === 25 && (nodeVersion[1] ?? 0) >= 1) ||
    (nodeVersion[0] === 24 && (nodeVersion[1] ?? 0) >= 13) ||
    (denoVersion[0] ?? 0) > 2 ||
    (denoVersion[0] === 2 && (denoVersion[1] ?? 0) >= 8);

  // Prefer the builtin `require` if possible. This is present in CommonJS,
  // including a bundler's CJS output, so no need to ever have to evaluate
  // `import.meta.url` there.
  //
  // esbuild and friends rewrite `import.meta.url` to `{}` for CJS output,
  // which would make `createRequire(undefined)` throw.
  // Only use `import.meta.url` in true ESM, where there's no `require`
  const nodeRequire = typeof require === 'function' ? require : createRequire(import.meta.url);

  // `Module.registerHooks` / `Module.register` are newer than the @types/node
  // we build against, hence the cast.
  const mod = Module as unknown as {
    registerHooks?: (hooks: unknown) => void;
    register?: (specifier: string, options: unknown) => void;
  };

  // runs both at `--import` time and (synchronously) inside `Sentry.init()`,
  // so an unguarded throw would either abort startup or make `init()` throw.
  // On any failure (e.g. dep resolution, `require(esm)` / Node-compat
  // incompatibility) we warn (DEBUG only) and continue without channel
  // injection
  try {
    if (typeof mod.registerHooks === 'function' && stableSyncHooks) {
      // Sync hooks cover CJS and ESM, no separate `_compile` patch needed.
      // We require() the module here so that we can synchronously load it,
      // including from a CommonJS Sentry build, without bundlers pulling in.
      // All versions in stableSyncHooks support this.
      const { initialize, resolve, load } = nodeRequire('@apm-js-collab/tracing-hooks/hook-sync.mjs') as {
        initialize: (opts: { instrumentations: unknown }) => void;
        resolve: unknown;
        load: unknown;
      };
      initialize({ instrumentations: SENTRY_INSTRUMENTATIONS });
      mod.registerHooks({ resolve, load });
      DEBUG_BUILD && debug.log('[orchestrion] registered diagnostics-channel injection via Module.registerHooks()');
    } else if (typeof mod.register === 'function' && !globalAny.Bun && !globalAny.Deno) {
      // `Module.register` + the `_compile` patch is Node 18.19–24.12 / 25.0
      // path. Bun/Deno are excluded: they don't support this combination and
      // must use the stable `registerHooks` path above (or none at all).
      // Resolve the hook to an absolute file URL ourselves so
      // `Module.register` needs no `parentURL`, so no need for
      // `import.meta.url` polyfilling
      mod.register(pathToFileURL(nodeRequire.resolve('@apm-js-collab/tracing-hooks/hook.mjs')).href, {
        data: { instrumentations: SENTRY_INSTRUMENTATIONS },
      });

      // ALSO patch `Module.prototype._compile` for the CJS side: when an ESM
      // file `import`s a CJS package, the package's internal `require()` calls
      // are resolved through the CJS machinery and never reach the ESM
      // register hook, so without this patch the file we want to instrument
      // loads untransformed.
      const ModulePatch = nodeRequire('@apm-js-collab/tracing-hooks') as new (opts: { instrumentations: unknown }) => {
        patch: () => void;
      };
      new ModulePatch({ instrumentations: SENTRY_INSTRUMENTATIONS }).patch();
      DEBUG_BUILD && debug.log('[orchestrion] registered diagnostics-channel injection via Module.register()');
    } else {
      DEBUG_BUILD &&
        debug.warn('[Sentry] No available Node API to register diagnostics-channel injection hooks; skipping.');
      return;
    }
  } catch (error) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] Failed to register diagnostics-channel injection hooks; channel-based integrations ' +
          'will not record spans.',
        error,
      );
    return;
  }

  g.runtime = true;
}
