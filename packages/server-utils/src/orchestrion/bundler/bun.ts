/**
 * orchestrion code-transform plugin for Bun's bundler (`bun build`).
 *
 * Returns a Bun plugin that wraps `@apm-js-collab/code-transformer-bundler-plugins/bun`
 * (configured with the central `SENTRY_INSTRUMENTATIONS`) and additionally injects
 * the `globalThis.__SENTRY_ORCHESTRION__.bundler` marker that
 * `detectOrchestrionSetup()` reads — so a user who registers channel-based
 * integrations but forgot to wire up this plugin gets warned rather than silently
 * recording nothing.
 *
 * BUILD-ONLY. This is meant for `Bun.build({ plugins: [sentryBunPlugin()] })`.
 * It is NOT used as a runtime (`bun run`) plugin: a module returned by a runtime
 * `onLoad` plugin in Bun loses its CommonJS named exports (a long-standing,
 * still-open Bun bug), which would break CommonJS dependencies such as `mysql`
 * rather than instrument them. The Bun SDK therefore only exposes this for
 * bundling (`@sentry/bun/plugin`); there is no `bun run` preload.
 *
 * This module is the cross-platform *functionality* only — it does NOT import
 * `bun` or call Bun's runtime `plugin()`. Shipped as both ESM and CJS via the
 * `@sentry-internal/server-utils/orchestrion/bun` subpath, so a user's `bun build`
 * script can be authored in either module system.
 *
 * @module
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

// `@apm-js-collab/code-transformer-bundler-plugins/bun` is published ESM-only (no
// `require` arm, unlike its `/vite` entry). tsc type-checks `src` in this
// package's CJS module mode and flags the ESM-only import (TS1479). It's a false
// positive: the ESM build `import`s it; the CJS build `require()`s it, which Bun
// (the only consumer of this Bun bundler plugin) supports for ESM modules.
// @ts-expect-error -- ESM-only upstream import; resolved correctly under Bun in both module systems.
import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/bun';
import { SENTRY_INSTRUMENTATIONS } from '../config';

// Runs at the built app's boot (injected via `Bun.build`'s banner) and sets the
// bundler marker so the runtime detector knows the build-time transform ran.
const BUNDLER_MARKER_BANNER =
  ';(globalThis.__SENTRY_ORCHESTRION__=(globalThis.__SENTRY_ORCHESTRION__||{})).bundler=true;';

// Minimal shape of Bun's `PluginBuilder` that we touch. Typed locally instead
// of depending on `bun-types`, which would pull Bun's globals.
interface BunPluginBuilder {
  config?: { banner?: string };
}

/**
 * Returns the orchestrion code-transform plugin for Bun's bundler, configured
 * with the central `SENTRY_INSTRUMENTATIONS`. The plugin injects
 * `diagnostics_channel.tracingChannel` calls into the instrumented libraries as
 * `bun build` bundles them, and injects a banner that sets
 * `globalThis.__SENTRY_ORCHESTRION__.bundler = true` when the bundle boots (so
 * `detectOrchestrionSetup()` knows the transform ran).
 *
 * Pass the result to `Bun.build({ plugins: [...] })`. This is build-only — see
 * the file header for why there is no `bun run` runtime variant.
 *
 * @example
 * ```ts
 * import { sentryBunPlugin } from '@sentry/bun/plugin';
 * await Bun.build({ entrypoints: ['./app.ts'], plugins: [sentryBunPlugin()] });
 * ```
 */
export function sentryBunPlugin(): UnknownPlugin {
  // Typed upstream as an esbuild `Plugin`, but Bun passes its own `PluginBuilder`
  // (which has the `onLoad` the transform uses) to `setup`. Cast to the
  // Bun-compatible shape so we can forward Bun's builder to its `setup`.
  const transformer = codeTransformer({ instrumentations: SENTRY_INSTRUMENTATIONS }) as unknown as {
    setup: (build: BunPluginBuilder) => void;
  };

  return {
    name: 'sentry-orchestrion',
    setup(build: BunPluginBuilder): void {
      // Inject a banner so the bundled output sets `bundler: true` at boot.
      // `config` is the `Bun.build` config (documented as mutable) and is present
      // when this plugin is passed to `Bun.build({ plugins: [...] })`.
      if (build.config) {
        const existing = build.config.banner ?? '';
        build.config.banner = existing ? `${existing}\n${BUNDLER_MARKER_BANNER}` : BUNDLER_MARKER_BANNER;
      }

      // Delegate to the upstream code-transformer, which registers the `onLoad`
      // hook that does the actual channel injection.
      transformer.setup(build);
    },
  };
}
