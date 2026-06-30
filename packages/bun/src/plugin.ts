/**
 * orchestrion code-transform plugin for Bun's bundler (`bun build`).
 *
 * Usage:
 *
 * ```ts
 * import { sentryBunPlugin } from '@sentry/bun/plugin';
 * await Bun.build({
 *   entrypoints: ['./app.ts'],
 *   plugins: [sentryBunPlugin()],
 * });
 * ```
 *
 * This is BUILD-ONLY. Runtime instrumentation (`bun run`) is intentionally not
 * offered: a module returned by a runtime `onLoad` plugin in Bun loses its
 * CommonJS named exports.
 *
 * When https://github.com/oven-sh/bun/pull/31770 lands, we can revisit.
 *
 * Until then, Bun apps must bundle to get orchestrion instrumentation. In dev
 * (ie, `bun run`) there is simply no instrumentation, which is clearer than
 * partial/inconsistent coverage.
 *
 * Shipped as both ESM and CJS (via the `@sentry/bun/plugin` subpath) so a user's
 * `bun build` script can be authored in either module system. It's a plain
 * library import here (not a `--import`/`--preload` hook), so CJS is fine; Bun
 * resolves the underlying ESM-only transformer in either module system.
 *
 * @module
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

// `@apm-js-collab/code-transformer-bundler-plugins/bun` is published ESM-only
// (no `require` arm, unlike its `/vite` entry). The ESM build imports it; the
// CJS build requires it. Bun resolves correctly for ESM modules in either
// module system.
import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/bun';
import { SENTRY_INSTRUMENTATIONS, withoutInstrumentedExternals } from '@sentry/server-utils/orchestrion/config';

const BUNDLER_MARKER_BANNER =
  ';(globalThis.__SENTRY_ORCHESTRION__=(globalThis.__SENTRY_ORCHESTRION__||{})).bundler=true;';

// Minimal shape of Bun's `PluginBuilder` that we touch. Typed locally instead
// of depending on `bun-types`, which would pull Bun's globals.
interface BunPluginBuilder {
  config?: { banner?: string; external?: string[] };
}

/**
 * Returns the orchestrion code-transform plugin for Bun's bundler, configured
 * with the central `SENTRY_INSTRUMENTATIONS`. The plugin injects
 * `diagnostics_channel.tracingChannel` calls into the instrumented libraries as
 * `bun build` bundles them, and injects a banner that sets
 * `globalThis.__SENTRY_ORCHESTRION__.bundler = true` when the bundle boots
 *
 * Pass the result to `Bun.build({ plugins: [...] })`.
 *
 * @example
 * ```ts
 * import { sentryBunPlugin } from '@sentry/bun/plugin';
 * await Bun.build({ entrypoints: ['./app.ts'], plugins: [sentryBunPlugin()] });
 * ```
 */
export function sentryBunPlugin(): UnknownPlugin {
  // Typed upstream as an esbuild `Plugin`, but Bun passes its own
  // `PluginBuilder` (which has the `onLoad` the transform uses) to `setup`.
  // Cast to the Bun-compatible shape so we can forward Bun's builder to its
  // `setup`.
  const transformer = codeTransformer({ instrumentations: SENTRY_INSTRUMENTATIONS }) as unknown as {
    setup: (build: BunPluginBuilder) => void;
  };

  return {
    name: 'sentry-orchestrion',
    setup(build: BunPluginBuilder): void {
      // Inject a banner so the bundled output sets `bundler: true` at boot.
      // `config` is the `Bun.build` config and is present when this plugin
      // is passed to `Bun.build({ plugins: [...] })`.
      if (build.config) {
        const existing = build.config.banner ?? '';
        build.config.banner = existing ? `${existing}\n${BUNDLER_MARKER_BANNER}` : BUNDLER_MARKER_BANNER;

        // Force-bundle every instrumented package. An externalized dependency
        // is resolved from `node_modules` at runtime and never passes throug
        // the transform's `onLoad`, so its diagnostics_channel calls would
        // be silently never injected. Bun has no runtime fallback here, so
        // bundling is the only injection path.
        build.config.external = withoutInstrumentedExternals(build.config.external);
      }

      // Delegate to the upstream code-transformer, which registers the `onLoad`
      // hook that does the actual channel injection.
      transformer.setup(build);
    },
  };
}
