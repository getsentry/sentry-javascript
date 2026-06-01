// EXPERIMENTAL — Vite plugin that runs the orchestrion code transform at build
// time, injecting `diagnostics_channel.tracingChannel` calls into the libraries
// listed in `SENTRY_INSTRUMENTATIONS`.
//
// This file is published ESM-only via the `@sentry/node/orchestrion/vite`
// subpath export. `@apm-js-collab/code-transformer-bundler-plugins` is
// `"type": "module"`, so consuming it from a CJS build is intentionally
// unsupported — vite.config.ts is almost always ESM in practice. The CJS
// rollup variant still emits this file, but `package.json` only exposes the
// ESM entry, so attempts to `require('@sentry/node/orchestrion/vite')` will
// fail at resolution time rather than producing a half-broken plugin.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import MagicString from 'magic-string';
import { SENTRY_INSTRUMENTATIONS } from '../config';

// `vite` types live in the package's ESM-only subpath; under Node16 module
// resolution with TS treating @sentry/node as CJS, importing them produces a
// false positive. We don't need the runtime value for typing — `UnknownPlugin`
// is sufficient — so we omit the import entirely.

/**
 * Vite plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Vite (e.g. Vite SSR builds, Nuxt's Nitro
 * pipeline, SvelteKit). For unbundled Node processes use the runtime hook
 * instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * Returns two plugins:
 *   1. `sentry-orchestrion-marker` — a `renderChunk` hook that prepends a
 *      single-line banner to entry chunks. The banner sets
 *      `globalThis.__SENTRY_ORCHESTRION__.bundler = true` at app boot, so the
 *      `_experimentalSetupOrchestrion()` detector can confirm the bundler path
 *      ran (rather than relying on a build-time flag that wouldn't be visible
 *      to the runtime).
 *      Also injects every instrumented package name into `ssr.noExternal` via
 *      the `config` hook, since externalized deps are `require()`d at runtime
 *      from `node_modules` and never pass through the transform.
 *   2. The upstream `@apm-js-collab/code-transformer-bundler-plugins/vite`
 *      plugin, fed our central `SENTRY_INSTRUMENTATIONS` config.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryOrchestrionPlugin } from '@sentry/node/orchestrion/vite';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(): UnknownPlugin[] {
  const codeTransformerPlugins = codeTransformer({ instrumentations: SENTRY_INSTRUMENTATIONS });
  const codeTransformerArray: UnknownPlugin[] = Array.isArray(codeTransformerPlugins)
    ? codeTransformerPlugins
    : [codeTransformerPlugins];
  return [bundlerMarkerPlugin(), ...codeTransformerArray];
}

function bundlerMarkerPlugin(): UnknownPlugin {
  const banner = [
    'globalThis.__SENTRY_ORCHESTRION__ = (globalThis.__SENTRY_ORCHESTRION__ || {});',
    'globalThis.__SENTRY_ORCHESTRION__.bundler = true;',
    '',
  ].join('\n');

  const instrumentedModules = Array.from(new Set(SENTRY_INSTRUMENTATIONS.map(i => i.module.name)));

  return {
    name: 'sentry-orchestrion-marker',
    enforce: 'pre' as const,
    config(): { ssr: { noExternal: string[] } } {
      // Force-bundle every instrumented package so the code transform actually
      // sees its source. Vite externalizes dependencies in SSR builds by
      // default, leaving them as bare `require()`/`import` calls resolved from
      // `node_modules` at runtime — those copies are untouched and the
      // diagnostics_channel calls never get injected. Vite merges array
      // `noExternal` entries with the user's config, so we don't overwrite
      // their additions.
      return { ssr: { noExternal: instrumentedModules } };
    },
    renderChunk(code: string, chunk: { isEntry: boolean }): { code: string; map: unknown } | null {
      if (!chunk.isEntry) return null;
      // Prepend via magic-string so the entry chunk's sourcemap stays aligned —
      // returning `map: null` here would shift every mapping by the banner's
      // line count and misattribute server stack traces.
      const ms = new MagicString(code);
      ms.prepend(banner);
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}
