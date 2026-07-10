import { debug } from '@sentry/core';
import { createRequire } from 'node:module';
import * as Module from 'node:module';
import { pathToFileURL } from 'node:url';
import { DEBUG_BUILD } from '../../debug-build';
import { SENTRY_INSTRUMENTATIONS } from '../config';

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

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__: { runtime?: boolean; bundler?: boolean } | undefined;
}

/** `Module.registerHooks` only became stable in Node 24.13 / 25.1 and Deno 2.8. */
function hasStableSyncModuleHooks(denoVersionString: string | undefined): boolean {
  const parseVersion = (v: string): number[] => v.split('.').map(n => parseInt(n, 10));
  const nodeVersion = parseVersion(process.versions.node ?? '0.0.0');
  const denoVersion = parseVersion(denoVersionString ?? '0.0.0');
  return (
    (nodeVersion[0] ?? 0) > 25 ||
    (nodeVersion[0] === 25 && (nodeVersion[1] ?? 0) >= 1) ||
    (nodeVersion[0] === 24 && (nodeVersion[1] ?? 0) >= 13) ||
    (denoVersion[0] ?? 0) > 2 ||
    (denoVersion[0] === 2 && (denoVersion[1] ?? 0) >= 8)
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
 *
 * Idempotent via `globalThis.__SENTRY_ORCHESTRION__` — a no-op if the runtime
 * `--import` hook or a bundler plugin already injected the channels.
 */
export function registerDiagnosticsChannelInjection(options?: RegisterDiagnosticsChannelInjectionOptions): void {
  const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});

  // Already injected (runtime --import hook or bundler plugin) — nothing to do.
  if (g.runtime || g.bundler) {
    return;
  }

  const globalAny = globalThis as { Bun?: unknown; Deno?: { version?: { deno?: string } } };
  const stableSyncHooks = hasStableSyncModuleHooks(globalAny.Deno?.version?.deno);

  let thisModuleUrl: string;
  /*! rollup-include-cjs-only */
  thisModuleUrl = pathToFileURL(__filename).href;
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  thisModuleUrl = import.meta.url;
  /*! rollup-include-esm-only-end */

  // Default: bare specifiers via a plain (aliased) `require`, so bundlers see and resolve them
  // like any other dependency. Override: with `tracingHooksDir`, absolute paths are loaded through
  // `createRequire`, which bundlers leave as a true runtime require — they must not statically
  // resolve these (Turbopack fails the build on an absolute request, and the machinery breaks when
  // bundled anyway). `createRequire` rather than ignore-comments because webpack only honors
  // `webpackIgnore` on `import()`, not `require()` (it compiles the call to a broken module stub).
  let nodeRequire: (specifier: string) => unknown;
  /*! rollup-include-cjs-only */
  nodeRequire = require;
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  nodeRequire = createRequire(import.meta.url);
  /*! rollup-include-esm-only-end */

  const tracingHooksDir = options?.tracingHooksDir;
  const requireFromHooksDir = tracingHooksDir ? createRequire(thisModuleUrl) : undefined;

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
      const { initialize, resolve, load } = (
        requireFromHooksDir
          ? requireFromHooksDir(`${tracingHooksDir}/hook-sync.mjs`)
          : nodeRequire('@apm-js-collab/tracing-hooks/hook-sync.mjs')
      ) as {
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
      // `Module.register` resolves ESM-style: a bare package specifier is resolved against
      // `parentURL`, but a filesystem path (the `tracingHooksDir` override) is not a valid ESM
      // specifier and must be passed as a file:// URL.
      const hookSpecifier = tracingHooksDir
        ? pathToFileURL(`${tracingHooksDir}/hook.mjs`).href
        : '@apm-js-collab/tracing-hooks/hook.mjs';
      mod.register(hookSpecifier, {
        parentURL: thisModuleUrl,
        data: { instrumentations: SENTRY_INSTRUMENTATIONS },
      });

      // ALSO patch `Module.prototype._compile` for the CJS side: when an ESM
      // file `import`s a CJS package, the package's internal `require()` calls
      // are resolved through the CJS machinery and never reach the ESM
      // register hook, so without this patch the file we want to instrument
      // loads untransformed.
      const ModulePatch = (
        requireFromHooksDir && tracingHooksDir
          ? requireFromHooksDir(tracingHooksDir)
          : nodeRequire('@apm-js-collab/tracing-hooks')
      ) as new (opts: { instrumentations: unknown }) => {
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
