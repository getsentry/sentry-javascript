import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/bun';
import { INSTRUMENTED_MODULE_NAMES, withoutInstrumentedExternals } from '../config';
import { ORCHESTRION_BUNDLER_MARKER_BANNER } from './moduleInjectedTransform';
import type { PluginOptions } from './options';
import { orchestrionTransformOptions } from './options';

// oxlint-disable-next-line typescript/no-explicit-any
type UnknownPlugin = any;

// Minimal shape of Bun's `PluginBuilder` that we touch. Typed locally instead
// of depending on `bun-types`, which would pull Bun's globals into this build.
interface BunPluginBuilder {
  config?: { banner?: string; external?: string[]; packages?: 'bundle' | 'external' };
}

/**
 * Sentry orchestrion code-transform plugin for Bun's bundler (`bun build`), exposed to users via the
 * `@sentry/bun/plugin` subpath (which re-exports this as `sentryBunPlugin`).
 *
 * This is BUILD-ONLY. Runtime instrumentation (`bun run`) is intentionally not offered: a module
 * returned by a runtime `onLoad` plugin in Bun loses its CommonJS named exports. When
 * https://github.com/oven-sh/bun/pull/31770 lands, we can revisit. Until then, Bun apps must bundle
 * to get build-time instrumentation; in dev (`bun run`) there is simply no instrumentation, which is
 * clearer than partial/inconsistent coverage.
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
  // Typed upstream as an esbuild `Plugin`, but Bun passes its own `PluginBuilder` (which has the
  // `onLoad` the transform uses) to `setup`. Cast to the Bun-compatible shape so we can forward
  // Bun's builder to its `setup`.
  const transformer = codeTransformer(
    orchestrionTransformOptions(options, { injectDiagnostics: false }),
  ) as unknown as {
    setup: (build: BunPluginBuilder) => void;
  };

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
        build.config.external = withoutInstrumentedExternals(build.config.external);

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
              `these packages your app uses: ${INSTRUMENTED_MODULE_NAMES.join(', ')}. To instrument them, ` +
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
