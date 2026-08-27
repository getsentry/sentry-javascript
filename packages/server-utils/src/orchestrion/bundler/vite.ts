import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import type { Plugin, ResolvedConfig } from 'vite';

export type { Plugin as VitePlugin } from 'vite';
import { instrumentedModuleNames } from '../config';
import type { PluginOptions } from './options';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';
import { resolveOrchestrionRuntimeRequest, SNIPPET_IMPORT_SPECIFIER } from './resolve';

type TransformHandler = (this: unknown, code: string, id: string, opts?: { ssr?: boolean }) => unknown;

// On Vite >= 6 `applyToEnvironment` (below) keeps the whole plugin out of
// client environments. Vite 5 (e.g. Remix v2) ignores that hook, so without
// this gate the transform would also run in the CLIENT build — where modules
// like `@remix-run/server-runtime` sit in the client graph, and the injected
// snippet's import of the subscriber factories (which import
// `node:diagnostics_channel`) breaks against Vite's browser builtin shim. Gate
// on the `ssr` flag, which Vite passes on both major versions.
function ssrOnlyTransform(transform: Plugin['transform']): Plugin['transform'] {
  const gate = (handler: TransformHandler): TransformHandler =>
    function (code, id, opts) {
      if (!opts?.ssr) {
        return null;
      }
      return handler.call(this, code, id, opts);
    };

  if (typeof transform === 'function') {
    return gate(transform as TransformHandler) as Plugin['transform'];
  }
  if (transform && typeof transform === 'object') {
    return { ...transform, handler: gate(transform.handler as TransformHandler) } as Plugin['transform'];
  }
  return transform;
}

/**
 * Vite plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Vite (e.g. Vite SSR builds, Nuxt's Nitro
 * pipeline, SvelteKit). For unbundled Node processes use the runtime hook
 * instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(options: PluginOptions = {}): Plugin {
  if (options.buildTimeInstrumentation === false) {
    // Return an inert plugin so SDKs that unconditionally push it into their
    // plugin array can still opt out without any code transform, `noExternal`
    // force-bundling, or injected diagnostics landing in the build.
    return { name: 'sentry-orchestrion-disabled' };
  }

  const upstream = codeTransformer(orchestrionTransformOptions(options));

  return {
    ...upstream,
    transform: ssrOnlyTransform(upstream.transform),
    // The module-injected snippet imports `@sentry/server-utils` from INSIDE
    // transformed `node_modules` files. Under isolated installs (pnpm) that bare
    // specifier doesn't resolve from an instrumented package's location, so when
    // normal resolution fails, fall back to this package's own resolution so it
    // gets bundled from its real on-disk path. SSR-gated like the transform: the
    // specifier only appears in SSR modules.
    async resolveId(source, importer, resolveOptions) {
      if (source !== SNIPPET_IMPORT_SPECIFIER || !resolveOptions?.ssr) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...resolveOptions, skipSelf: true });
      if (resolved) {
        return resolved;
      }
      return resolveOrchestrionRuntimeRequest(source) ?? null;
    },
    applyToEnvironment(environment) {
      // Orchestrion splices `node:diagnostics_channel` calls into instrumented modules, which only
      // exist server-side. Only apply to server-consumed environments so injected `tracingChannel`
      // calls never land in a browser (`client`) bundle (where they'd throw `X is not a function`).
      return environment.config.consumer === 'server';
    },
    config(): { ssr: { noExternal: string[]; external: string[] } } {
      // Force-bundle every instrumented package so the code transform actually
      // sees its source. Vite externalizes dependencies in SSR builds by
      // default, leaving them as bare `require()`/`import` calls resolved from
      // `node_modules` at runtime — those copies are untouched and the
      // diagnostics_channel calls never get injected. Vite merges array
      // `noExternal` entries with the user's config, so we don't overwrite
      // their additions.
      //
      // `@sentry/server-utils` must be bundled too: the module-injected snippet
      // `require()`s it from inside transformed CJS deps, and when the package
      // stays external, Vite 5's CommonJS interop (`esmExternals: false`)
      // rewrites that require into a DEFAULT import of our named-exports-only
      // ESM entry — a link-time crash at server startup. Bundling sidesteps
      // external ESM/CJS interop on both Vite majors, and the ESM barrel
      // tree-shakes to just the helper and the factories actually referenced.
      //
      // Conversely, `@sentry/node` must stay EXTERNAL. Its `init()` installs the
      // runtime diagnostics-channel hook via `@sentry/server-utils/orchestrion/
      // register`, which loads the vendored code transformer and, on older Node,
      // `Module.register`s a hook module by a self-referential specifier that
      // only resolves from the package's real `node_modules` location. Bundling
      // `@sentry/node` therefore strips the transformer (tree-shaking) AND breaks
      // that self-reference. It's a different package from the `@sentry/server-
      // utils` barrel above, so listing it here is not a package-granularity
      // conflict; explicit `ssr.external` entries also win over `noExternal`, so
      // this holds even against a preset that would otherwise inline it. A
      // matching runtime warning in `orchestrion/register` covers bundlers this
      // plugin can't reach.
      return {
        ssr: {
          noExternal: [...instrumentedModuleNames(options.instrumentations), '@sentry/server-utils'],
          external: ['@sentry/node'],
        },
      };
    },
    configResolved(config: ResolvedConfig): void {
      // Explicit `ssr.external` string entries take priority over `noExternal`
      // in Vite, so they defeat the force-bundling above. (`ssr.external: true`
      // does not — `noExternal` entries still win there.)
      const external = config.ssr?.external;
      if (!Array.isArray(external)) {
        return;
      }
      const moduleNames = instrumentedModuleNames(options.instrumentations);
      const externalizedModules = moduleNames.filter(name =>
        external.some(entry => externalEntryMatchesModule(entry, name)),
      );
      if (externalizedModules.length > 0) {
        config.logger.warn(`[Sentry] ${externalizedModulesWarning(externalizedModules)}`);
      }
    },
  };
}
