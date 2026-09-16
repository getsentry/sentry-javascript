import { consoleSandbox, debug, getClient, GLOBAL_OBJ, parseSemver } from '@sentry/core';
import { existsSync } from 'node:fs';
import * as Module from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SENTRY_RUNTIME_INSTRUMENTATIONS } from '@sentry/server-utils/orchestrion/config';
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
 * Emit an always-on warning. Unlike `debug.warn` (gated behind `debug: true`), this reaches every
 * user — otherwise a broken transform silently records no channel-based spans.
 */
function warn(message: string): void {
  consoleSandbox(() => {
    // oxlint-disable-next-line no-console
    console.warn(`[Sentry] ${message}`);
  });
}

/** As {@link warn}, but appends the bundling/troubleshooting docs link for the build-fix cases. */
function warnRuntimeUnavailable(message: string): void {
  warn(`${message} See ${BUNDLING_DOCS_URL}`);
}

// A systemic transformer failure breaks every module, so the "bundled" fix is stated once.
let warnedTransformerUnavailable = false;
// Isolated per-module failures are unrelated to bundling, so they warn once per module.
const warnedModuleFailures = new Set<string>();

/**
 * A module's transform threw. Two very different causes reach this callback, so distinguish them
 * instead of always blaming bundling — and always include the underlying error, so the message is
 * self-diagnosing rather than asserting a cause the reader can't check (`debug: true` still logs
 * the full error and stack).
 *
 * - The transform pipeline itself is gone → a bare `TypeError: <name> is not a function`. That is
 *   the fingerprint of a bundler inlining and tree-shaking `@sentry/server-runtime-injection`,
 *   which drops its vendored meriyah `parse` / astring `generate` (both module-level imports): it
 *   fails EVERY module the same way and is app-wide, with an actionable build fix. The identifier is
 *   NOT matched, because the same bundle renames it beyond recognition — esbuild deconflicts to
 *   `parse2`, rollup/vite to `parse$1`, and production minifiers to a short opaque `n` — so we match
 *   the *shape* (a bare `<ident> is not a function`) plus the fact that nothing was ever
 *   instrumented (a transformer that has already instrumented something is provably not stripped).
 * - Any other transform `TypeError` (e.g. `transform is not a function`, from a config whose
 *   operator is not registered at runtime — `transform` is a local dispatch, not a stripped import,
 *   so an unbundled install throws with its real, unmangled name) is not a bundling problem — even
 *   when it is the first module to load — so it gets a scoped message that points at reporting it,
 *   not changing the build. A member-expression failure (`x.y is not a function`) is likewise an
 *   ordinary per-module bug, not a stripped top-level binding, so the bare-identifier anchor
 *   excludes it.
 */
function warnTransformFailed(moduleName: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);

  // A stripped pipeline throws `<ident> is not a function` for a *bare* identifier (the renamed
  // `parse`/`generate` binding); the anchors exclude member-expression failures like `x.y is ...`.
  const barePrimitiveMissing = /^[\w$]+ is not a function$/.test(reason);
  // The operator dispatch is a local, only missing when a config operator is unregistered, and an
  // unbundled install reads it under its real name — never a stripped-transformer symptom.
  const isolatedOperatorFailure = reason === 'transform is not a function';
  // A non-empty `runtime` list (something was already instrumented) proves the pipeline works.
  const nothingInstrumentedYet = (GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.runtime?.length ?? 0) === 0;
  const pipelineStripped = barePrimitiveMissing && !isolatedOperatorFailure && nothingInstrumentedYet;

  if (!pipelineStripped) {
    if (warnedModuleFailures.has(moduleName)) {
      return;
    }
    warnedModuleFailures.add(moduleName);
    warn(
      `Could not instrument \`${moduleName}\` (${reason}). Other instrumented dependencies are ` +
        `unaffected, so this is not a bundling problem. If \`${moduleName}\` should be traced, please report it.`,
    );
    return;
  }

  if (warnedTransformerUnavailable) {
    return;
  }
  warnedTransformerUnavailable = true;
  warnRuntimeUnavailable(
    `\`@sentry/server-runtime-injection\` was bundled into your application, so \`${moduleName}\` and any ` +
      `other instrumented dependency load uninstrumented (${reason}). Keep ` +
      '`@sentry/server-runtime-injection` external in your server bundle, or use the Sentry bundler ' +
      'plugin for build-time instrumentation.',
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

  setDiagnosticsHook(({ url, moduleName, error }): void => {
    if (error) {
      // A transform throwing a `TypeError` costs this module its instrumentation, so it is worth an
      // always-on warning; `warnTransformFailed` decides whether that is systemic (bundling) or
      // isolated. Every other transform failure stays debug-only.
      if (error instanceof TypeError) {
        warnTransformFailed(moduleName, error);
      }
      debug.warn(`[instrumentation] failed to inject diagnostics-channel into ${moduleName}:`, error);
    } else {
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = GLOBAL_OBJ.__SENTRY_ORCHESTRION__ || {};
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime = GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime || [];
      GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtime.push(moduleName);
      // Record the module's resolved file so integrations can anchor dependency resolution on the
      // app's actual copy, even under ESM (where the CJS `require.cache` never sees the module).
      (GLOBAL_OBJ.__SENTRY_ORCHESTRION__.runtimeFiles ??= {})[moduleName] = url;
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
      initialize({ instrumentations: SENTRY_RUNTIME_INSTRUMENTATIONS });
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

      // Our own bundled copy of the tracing-hooks async hooks (see `src/hook.mjs`) — the dependency
      // itself is bundled into this package's build and no longer resolvable as a bare specifier at
      // runtime.
      //
      // Registered by path rather than through the `@sentry/server-runtime-injection/hook`
      // self-reference, because `Module.register` resolves its specifier at RUNTIME. `@vercel/nft`
      // does evaluate `Module.register()` calls, but only where it can follow the `node:module`
      // binding, and in the CJS build rollup routes that through an interop namespace helper
      // (`const mod = require$$1__namespace`) it cannot see through. The hook then never reaches
      // traced output, and the CJS build is the one Next.js loads, so `output: 'standalone'`,
      // Docker and Vercel builds lose channel instrumentation entirely and only say so behind
      // `debug: true`. A literal relative path is static in either build, and it is still computed
      // at runtime from `__filename`/`import.meta.url`, so nothing absolute is baked in.
      //
      // Built from `join()` rather than `new URL('./hook.js', import.meta.url)` because webpack
      // reads that second form as an asset reference: it copies the hook next to the app bundle
      // without its vendored chunks, which would leave the loader thread importing a file whose
      // own imports are missing.
      let hookPath: string;
      /*! rollup-include-cjs-only */
      // This file is `build/cjs/register.js`; the loader thread needs the ESM build, which shares
      // the vendored dependency chunks.
      hookPath = join(__dirname, '../esm/hook.js');
      /*! rollup-include-cjs-only-end */
      /*! rollup-include-esm-only */
      hookPath = join(dirname(fileURLToPath(import.meta.url)), 'hook.js');
      /*! rollup-include-esm-only-end */

      // The path only points at the shipped hook while this package runs from `node_modules`. A
      // copy bundled into an app sits somewhere else entirely, so it keeps the self-reference,
      // which at least resolves against the app's own install. The same fallback catches a broken
      // path after a build layout change, hence the log: tracers would quietly stop following the
      // hook again, and this line is the only thing that says so.
      const hookFound = existsSync(hookPath);
      if (!hookFound) {
        debug.warn(`No orchestrion ESM hook at ${hookPath}; falling back to the package specifier.`);
      }

      const hookSpecifier = hookFound ? pathToFileURL(hookPath).href : '@sentry/server-runtime-injection/hook';

      mod.register(hookSpecifier, {
        parentURL,
        data: { instrumentations: SENTRY_RUNTIME_INSTRUMENTATIONS, diagnosticsPort },
        transferList: [diagnosticsPort],
      });

      // ALSO patch `Module.prototype._compile` for the CJS side: when an ESM
      // file `import`s a CJS package, the package's internal `require()` calls
      // are resolved through the CJS machinery and never reach the ESM
      // register hook, so without this patch the file we want to instrument
      // loads untransformed.
      new ModulePatch({ instrumentations: SENTRY_RUNTIME_INSTRUMENTATIONS }).patch();
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
