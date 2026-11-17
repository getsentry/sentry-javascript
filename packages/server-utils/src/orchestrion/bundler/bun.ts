import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/bun';
import { debug, GLOBAL_OBJ } from '@sentry/core';
import { isBun, isBunRuntimeInstrumentationSupported } from '../../utils/runtime';
import { instrumentedModuleNames, withoutInstrumentedExternals } from '../config';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORCHESTRION_BUNDLER_MARKER_BANNER } from './moduleInjectedTransform';
import type { PluginOptions } from './options';
import { orchestrionTransformOptions } from './options';
import { SNIPPET_IMPORT_SPECIFIER_FILTER } from './resolve';

// oxlint-disable-next-line typescript/no-explicit-any
type UnknownPlugin = any;

// Minimal shape of Bun's `PluginBuilder` that we touch. Typed locally instead
// of depending on `bun-types`, which would pull Bun's globals into this build.
interface BunPluginBuilder {
  config?: { banner?: string; external?: string[]; packages?: 'bundle' | 'external' };
  onResolve?: (
    options: { filter: RegExp },
    callback: (args: { path: string; importer: string }) => { path: string } | undefined,
  ) => void;
}

interface BunGlobal {
  plugin: (plugin: { name: string; setup: (build: BunPluginBuilder) => void }) => void;
  resolveSync: (specifier: string, parent: string) => string;
}

/**
 * Sentry orchestrion code-transform plugin for Bun's bundler (`bun build`), exposed to users via the
 * `@sentry/bun/plugin` subpath (which re-exports this as `sentryBunPlugin`). In `bun run`,
 * {@link registerBunRuntimeInstrumentation} registers the same plugin with `Bun.plugin()`.
 *
 * The plugin injects `diagnostics_channel.tracingChannel` calls into the instrumented libraries as
 * `bun build` bundles them — plus, via the module-injected transform, the snippet that records each
 * module on `globalThis.__SENTRY_ORCHESTRION__` when it is evaluated — and injects the marker banner
 * so `bundler` is set (to an empty `Set`) from boot, which gates the SDK's channel-integration setup
 * at `init()`.
 */
export function sentryOrchestrionPlugin(options: PluginOptions = {}): UnknownPlugin {
  if (options.buildTimeInstrumentation === false) {
    // Inert plugin — no banner, no force-bundling, no code transform — so SDKs that
    // unconditionally push it into their plugin array can still opt out.
    return { name: 'sentry-orchestrion-disabled', setup: () => undefined };
  }

  // Route through the shared assembly point so any future option reaches Bun too, but opt out of
  // the transformer's own `injectDiagnostics` — Bun injects the marker banner via its native
  // `banner` config below (which, unlike the upstream path, needs no `outdir`).
  //
  // Typed upstream as an esbuild `Plugin`, but Bun passes its own `PluginBuilder` (which has the
  // `onLoad` the transform uses) to `setup`. Cast to the Bun-compatible shape so we can forward
  // Bun's builder to its `setup`.
  const transformer = codeTransformer(
    orchestrionTransformOptions(options, { injectDiagnostics: false }),
  ) as unknown as {
    setup: (build: BunPluginBuilder) => void;
  };

  // Custom `instrumentations` must be bundled too, otherwise those packages can stay externalized
  // and their transform never runs, so fold them into the names we un-externalize and warn about.
  const moduleNames = instrumentedModuleNames(options.instrumentations);

  return {
    name: 'sentry-orchestrion',
    setup(build: BunPluginBuilder): void {
      // Inject the marker banner via Bun's native `banner` config (unlike the upstream
      // `injectDiagnostics` path, it needs no `outdir`). `config` is the `Bun.build` config and is
      // present when this plugin is passed to `Bun.build({ plugins: [...] })`.
      if (build.config) {
        const existing = build.config.banner ?? '';
        build.config.banner = existing
          ? `${existing}\n${ORCHESTRION_BUNDLER_MARKER_BANNER}`
          : ORCHESTRION_BUNDLER_MARKER_BANNER;

        // Force-bundle every instrumented package. An externalized dependency is resolved from
        // `node_modules` at runtime and never passes through the transform's `onLoad`, so its
        // diagnostics_channel calls would be silently never injected. Bun has no runtime fallback
        // here, so bundling is the only injection path.
        build.config.external = withoutInstrumentedExternals(build.config.external, moduleNames);

        // A blanket externalization strategy like `packages: 'external'` or `'*'` in `external`
        // externalizes instrumented packages too, and `withoutInstrumentedExternals` only strips
        // exact names/subpaths (not these), so those packages ship un-transformed with no runtime
        // fallback. Forcing them back in via `onResolve` is not an option: Bun ignores
        // `{ external: false }` against a blanket strategy, and returning a resolved `path` corrupts
        // the package's ESM/CJS interop. So warn instead. This runs in the user's build script,
        // where the Sentry debug logger isn't enabled, and `console` is the thing to use.
        const blanketExternal =
          build.config.packages === 'external'
            ? "packages: 'external'"
            : build.config.external?.includes('*')
              ? "'*' in external"
              : undefined;
        if (blanketExternal) {
          // oxlint-disable-next-line no-console
          console.warn(
            `[Sentry] This Bun build externalizes all dependencies (${blanketExternal}), so Sentry ` +
              'cannot instrument bundled libraries. Instrumentation will be missing for any of ' +
              `these packages your app uses: ${moduleNames.join(', ')}. To instrument them, ` +
              'externalize only the specific packages you need external instead of all of them.',
          );
        }
      }

      // Delegate to the upstream code-transformer, which registers the `onLoad` hook that does the
      // actual channel injection.
      transformer.setup(build);
    },
  };
}

/**
 * Registers the orchestrion code transform for `bun run` with `Bun.plugin()`, so modules
 * imported after this call get their diagnostics channels. `@sentry/bun` calls it in `init()`
 * and in its `@sentry/bun/import` preload, which also reaches the static imports of the entry
 * module. It is a no-op outside of Bun and after the first call.
 *
 * Sets `runtime` on the orchestrion marker, as the Node runtime hook does. The transformed
 * modules record their names on `bundler`, as they do in a `bun build` output.
 */
export function registerBunRuntimeInstrumentation(): void {
  const marker = (GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ??= {});
  if (!isBun() || marker.runtime || marker.runtimeUnavailable) {
    return;
  }

  // `detectOrchestrionSetup()` warns at `init()` if no channels were injected at all, which is
  // not the case for an app built with `@sentry/bun/plugin`.
  if (!isBunRuntimeInstrumentationSupported()) {
    marker.runtimeUnavailable = true;
    debug.log('[Sentry] This Bun version cannot instrument modules in `bun run`; skipping Bun.plugin()');
    return;
  }

  const bun = (GLOBAL_OBJ as { Bun?: BunGlobal }).Bun as BunGlobal;
  registerSnippetImportResolution(bun);
  bun.plugin(sentryOrchestrionPlugin());
  marker.runtime = [];
  debug.log('[Sentry] Registered diagnostics-channel injection via Bun.plugin()');
}

/**
 * The module-injected snippet imports `@sentry/server-utils` from INSIDE the transformed
 * `node_modules` files. Under isolated installs (pnpm) that bare specifier does not resolve from
 * an instrumented package's location. Only then, resolve it to the entry of the build this file
 * belongs to, which the SDK already loaded. Bun can `import` and `require()` both builds.
 */
function registerSnippetImportResolution(bun: BunGlobal): void {
  let dir: string;
  /*! rollup-include-cjs-only */
  dir = __dirname;
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  dir = dirname(fileURLToPath(import.meta.url));
  /*! rollup-include-esm-only-end */

  // `src/orchestrion/bundler/bun.ts` -> `src/index.ts`, in the same place in both builds.
  const entry = join(dir, '..', '..', 'index.js');
  // Missing when the SDK itself is bundled. Then Bun resolves the bare specifier.
  if (!existsSync(entry)) {
    return;
  }

  bun.plugin({
    name: 'sentry-orchestrion-resolve',
    setup(build) {
      build.onResolve?.({ filter: SNIPPET_IMPORT_SPECIFIER_FILTER }, args => {
        try {
          bun.resolveSync(args.path, dirname(args.importer));
          // Bun's own resolution picks the build that matches `import` or `require()`.
          return undefined;
        } catch {
          return { path: entry };
        }
      });
    },
  });
}
