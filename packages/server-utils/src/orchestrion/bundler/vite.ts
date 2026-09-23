import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import { builtinModules } from 'node:module';
import type { ConfigEnv, Plugin, ResolvedConfig, Rollup, UserConfig } from 'vite';

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

const BARE_BUILTINS = new Set(builtinModules.filter(name => !name.startsWith('node:')));

/**
 * Wraps `output.paths` so bare Node builtin imports are written with the `node:` prefix. The
 * force-bundled CJS dependencies call `require('events')` and similar, which Rollup keeps as a
 * bare `import "events"`. Node and Bun load that, but Deno before 2.9 does not.
 */
function prefixBuiltinPaths(paths: Rollup.OutputOptions['paths']): NonNullable<Rollup.OutputOptions['paths']> {
  return id => {
    const path = typeof paths === 'function' ? paths(id) : (paths?.[id] ?? id);
    return path === id && BARE_BUILTINS.has(id) ? `node:${id}` : path;
  };
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
  const noExternalModules = (): string[] => [
    ...instrumentedModuleNames(options.instrumentations),
    '@sentry/server-utils',
  ];

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
    // Vite externalizes dependencies in SSR builds, so the transform only sees an instrumented
    // package when it is bundled. `@sentry/server-utils` is bundled too, because the injected
    // snippet `require()`s it, and Vite 5's CJS interop turns that into a default import of our
    // ESM entry, which crashes at startup.
    // Not in `serve`: Vite's dev SSR runner has no CJS interop, so inlined `mysql`/`ioredis` throw
    // `exports is not defined`, and the runtime hook injects the same publishers instead.
    config: {
      // Runs after the framework plugins, so `build.ssr` set by their `config` hooks is visible.
      order: 'post',
      handler(config: UserConfig, env?: ConfigEnv): { ssr: { noExternal: string[] } } | null {
        // A top-level `ssr` key makes Vite 6+ add an `ssr` environment with no entry, which
        // `vite build --app` cannot build. Vite 5 has no `configEnvironment` and needs the key, and
        // its SSR builds always set `build.ssr`.
        if (env?.command === 'serve' || !(config.ssr || config.build?.ssr)) {
          return null;
        }

        return { ssr: { noExternal: noExternalModules() } };
      },
    },
    configEnvironment(
      name: string,
      config: { consumer?: 'client' | 'server' },
      env?: ConfigEnv,
    ): { resolve: { noExternal: string[] } } | null {
      if (env?.command === 'serve' || (config.consumer ?? (name === 'client' ? 'client' : 'server')) !== 'server') {
        return null;
      }

      return { resolve: { noExternal: noExternalModules() } };
    },
    outputOptions(outputOptions: Rollup.OutputOptions): Rollup.OutputOptions {
      return { ...outputOptions, paths: prefixBuiltinPaths(outputOptions.paths) };
    },
    configResolved(config: ResolvedConfig): void {
      // Nothing is force-bundled in `serve`, so an externalized module is expected there.
      if (config.command === 'serve') {
        return;
      }

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
