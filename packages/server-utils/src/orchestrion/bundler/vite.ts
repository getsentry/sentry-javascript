// EXPERIMENTAL — Vite plugin that runs the orchestrion code transform at build
// time, injecting `diagnostics_channel.tracingChannel` calls into the libraries
// listed in `SENTRY_INSTRUMENTATIONS`.
//
// This file is published ESM-only via the `@sentry/server-utils/orchestrion/vite`
// subpath export. `@apm-js-collab/code-transformer-bundler-plugins` is
// `"type": "module"`, so consuming it from a CJS build is intentionally
// unsupported — vite.config.ts is almost always ESM in practice. The CJS
// rollup variant still emits this file, but `package.json` only exposes the
// ESM entry, so attempts to `require('@sentry/server-utils/orchestrion/vite')` will
// fail at resolution time rather than producing a half-broken plugin.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import MagicString from 'magic-string';
import { INSTRUMENTED_MODULE_NAMES, SENTRY_INSTRUMENTATIONS } from '../config';

// `vite` types live in the package's ESM-only subpath; under Node16 module
// resolution with TS treating @sentry/server-utils as CJS, importing them produces a
// false positive. We don't need the runtime value for typing — `UnknownPlugin`
// is sufficient — so we omit the import entirely.

export interface SentryOrchestrionPluginOptions {
  /**
   * Bare specifier of a side-effect module that registers the SDK's
   * channel-subscriber integrations on the global orchestrion marker (e.g.
   * `@sentry/cloudflare/orchestrion`).
   *
   * When set, the plugin appends an import of this module to every server
   * module that statically imports the module's package (`@sentry/cloudflare`
   * in the example). This is how the subscriber integrations — which the SDK
   * deliberately does not import so bundlers can drop them — end up in the
   * bundle exactly when this plugin injects the channels they subscribe to.
   *
   * The specifier must be resolvable from the app being bundled, so it should
   * live in the SDK package the user directly depends on.
   */
  registrationModule?: string;
}

/**
 * Vite plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Vite (e.g. Vite SSR builds, Nuxt's Nitro
 * pipeline, SvelteKit). For unbundled Node processes use the runtime hook
 * instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * Returns the following plugins:
 *   1. `sentry-orchestrion-marker` — a `renderChunk` hook that prepends a
 *      single-line banner to entry chunks. The banner sets
 *      `globalThis.__SENTRY_ORCHESTRION__.bundler = true` at app boot, so the
 *      `_experimentalSetupOrchestrion()` detector can confirm the bundler path
 *      ran (rather than relying on a build-time flag that wouldn't be visible
 *      to the runtime).
 *      Also injects every instrumented package name into `ssr.noExternal` via
 *      the `config` hook, since externalized deps are `require()`d at runtime
 *      from `node_modules` and never pass through the transform.
 *   2. `sentry-orchestrion-register-integrations` (only with
 *      `options.registrationModule`) — injects the given registration module
 *      into server modules that import the SDK, see
 *      {@link SentryOrchestrionPluginOptions.registrationModule}.
 *   3. The upstream `@apm-js-collab/code-transformer-bundler-plugins/vite`
 *      plugin, fed our central `SENTRY_INSTRUMENTATIONS` config.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryOrchestrionPlugin } from '@sentry/node/orchestrion/vite';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(options: SentryOrchestrionPluginOptions = {}): UnknownPlugin[] {
  const codeTransformerPlugins = codeTransformer({ instrumentations: SENTRY_INSTRUMENTATIONS });
  const codeTransformerArray: UnknownPlugin[] = Array.isArray(codeTransformerPlugins)
    ? codeTransformerPlugins
    : [codeTransformerPlugins];
  return [
    bundlerMarkerPlugin(),
    ...(options.registrationModule ? [registerIntegrationsPlugin(options.registrationModule)] : []),
    ...codeTransformerArray,
  ];
}

/** Extracts `@scope/name` (or `name`) from a bare specifier with an optional subpath. */
function getPackageName(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] as string);
}

function registerIntegrationsPlugin(registrationModule: string): UnknownPlugin {
  const sdkPackage = getPackageName(registrationModule);
  // Only match static ESM imports: the registration module itself is ESM-only
  // in spirit (it must run at module-evaluation time), and injecting an
  // `import` statement into a CJS module would break it.
  const sdkImport = new RegExp(`from\\s*(['"])${sdkPackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`);

  // The slice of Vite's environment-API plugin context we read; typed structurally
  // since we don't import `vite` types here (see note at the top of the file).
  interface TransformContext {
    environment?: { config?: { consumer?: string } };
  }

  return {
    name: 'sentry-orchestrion-register-integrations',
    transform(this: TransformContext | undefined, code: string, _id: string): { code: string; map: unknown } | null {
      // Client bundles must never pull in a server SDK's integrations; without
      // environment info (classic non-environment-API Vite) assume server.
      if (this?.environment?.config?.consumer === 'client') return null;
      if (!sdkImport.test(code) || code.includes(registrationModule)) return null;
      const ms = new MagicString(code);
      // Appending keeps existing sourcemap lines intact; ESM hoisting makes the
      // import's position irrelevant, and registration only has to happen by
      // the time `init()` runs, not before the SDK module evaluates.
      ms.append(`\nimport ${JSON.stringify(registrationModule)};\n`);
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}

function bundlerMarkerPlugin(): UnknownPlugin {
  const banner = [
    'globalThis.__SENTRY_ORCHESTRION__ = (globalThis.__SENTRY_ORCHESTRION__ || {});',
    'globalThis.__SENTRY_ORCHESTRION__.bundler = true;',
    '',
  ].join('\n');

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
      return { ssr: { noExternal: INSTRUMENTED_MODULE_NAMES } };
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
