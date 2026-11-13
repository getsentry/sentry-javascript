import esbuildCodeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/esbuild';
import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import type { ConfigEnv, ConfigPluginContext, EnvironmentOptions, Plugin, ResolvedConfig, UserConfig } from 'vite';

export type { Plugin as VitePlugin } from 'vite';
import { instrumentedModuleNames } from '../config';
import type { PluginOptions } from './options';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';
import { createExternalRequireResolver } from './externalRequire';
import { resolveOrchestrionRuntimeRequest, SNIPPET_IMPORT_SPECIFIER, SNIPPET_IMPORT_SPECIFIER_FILTER } from './resolve';

type TransformHandler = (this: unknown, code: string, id: string, opts?: { ssr?: boolean }) => unknown;
type ResolveIdHandler = Extract<NonNullable<Plugin['resolveId']>, (...args: never[]) => unknown>;

// Key of a property on the plugin object. Its value is an object that is unique to each `sentryOrchestrionPlugin()`
// call. An SDK that wraps the plugin with an object spread (`@sentry/remix`) copies the property, so `configResolved`
// can find the first instance in a build also through a wrapper.
const INSTANCE_KEY = '__sentryOrchestrionInstance';

type OrchestrionInstance = { transformOptimizedDeps: boolean };

type OrchestrionVitePlugin = Plugin & { [INSTANCE_KEY]?: OrchestrionInstance };

function gateTransform(
  transform: Plugin['transform'],
  skip: (opts?: { ssr?: boolean }) => boolean,
): Plugin['transform'] {
  const gate = (handler: TransformHandler): TransformHandler =>
    function (code, id, opts) {
      if (skip(opts)) {
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

// Maps the CJS entry of `@sentry/server-utils` to its ESM entry; any other id is returned unchanged.
function toEsmEntry(id: string): string {
  return id.replace(/([/\\])build[/\\]cjs[/\\]index\.js$/, '$1build$1esm$1index.js');
}

// The module-injected snippet imports `@sentry/server-utils` from INSIDE
// transformed `node_modules` files. Under isolated installs (pnpm) that bare
// specifier doesn't resolve from an instrumented package's location, so when
// normal resolution fails, fall back to this package's own resolution so it
// gets bundled from its real on-disk path.
//
// Always bundle the ESM entry. In a CommonJS module the snippet `require()`s the specifier,
// which resolves to the CJS build. Vite 5-7 turn that build's `require()`s of external
// packages into default imports, and `@sentry/core` has no default export, so the server
// crashes at startup. Vite 8 keeps the `require()`s, which loads a second copy of `@sentry/core`.
async function resolveSnippetImport(
  this: ThisParameterType<ResolveIdHandler>,
  ...[source, importer, resolveOptions]: Parameters<ResolveIdHandler>
): Promise<Awaited<ReturnType<ResolveIdHandler>>> {
  const resolved = await this.resolve(source, importer, { ...resolveOptions, skipSelf: true });
  if (resolved) {
    return resolved.external ? resolved : { ...resolved, id: toEsmEntry(resolved.id) };
  }
  const fallback = resolveOrchestrionRuntimeRequest(source);
  return fallback ? toEsmEntry(fallback) : null;
}

// Rolldown plugin for the dependency optimizer of Vite 8.
function depOptimizerRolldownPlugin(options: PluginOptions, isDuplicate: () => boolean): Plugin {
  const upstream = codeTransformer(orchestrionTransformOptions(options));
  return {
    ...upstream,
    name: 'sentry-orchestrion-dep-optimizer',
    transform: gateTransform(upstream.transform, isDuplicate),
    resolveId(source, importer, resolveOptions) {
      return source === SNIPPET_IMPORT_SPECIFIER
        ? resolveSnippetImport.call(this, source, importer, resolveOptions)
        : null;
    },
  };
}

// esbuild plugin for the dependency optimizer of Vite 6 and 7.
function depOptimizerEsbuildPlugin(options: PluginOptions, isDuplicate: () => boolean): EsbuildPlugin {
  const upstream = esbuildCodeTransformer(orchestrionTransformOptions(options));
  return {
    name: 'sentry-orchestrion-dep-optimizer',
    setup(build) {
      if (isDuplicate()) {
        return;
      }
      // Same resolution as `resolveSnippetImport`. The `pluginData` marker stops the recursion back into this callback.
      build.onResolve({ filter: SNIPPET_IMPORT_SPECIFIER_FILTER }, async args => {
        if (args.pluginData === 'sentry-orchestrion-resolving') {
          return null;
        }
        const resolved = await build.resolve(args.path, {
          resolveDir: args.resolveDir,
          importer: args.importer,
          kind: args.kind,
          pluginData: 'sentry-orchestrion-resolving',
        });
        if (resolved.errors.length === 0) {
          return resolved.external ? resolved : { ...resolved, path: toEsmEntry(resolved.path) };
        }
        const fallback = resolveOrchestrionRuntimeRequest(args.path);
        return fallback ? { path: toEsmEntry(fallback) } : null;
      });
      return upstream.setup(build);
    },
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
  const resolveExternalRequire = createExternalRequireResolver(noExternalModules());

  const instance: OrchestrionInstance = { transformOptimizedDeps: options.transformOptimizedDeps === true };
  // `true` when an earlier instance of this plugin is in the same build, which then transforms the modules alone.
  let isDuplicate = false;
  // `true` when an earlier instance with `transformOptimizedDeps` is in the same build, which then transforms the
  // pre-bundled dependencies alone.
  let isDuplicateOptimizer = false;

  const plugin: OrchestrionVitePlugin = {
    ...upstream,
    [INSTANCE_KEY]: instance,
    // On Vite >= 6 `applyToEnvironment` (below) keeps the whole plugin out of
    // client environments. Vite 5 (e.g. Remix v2) ignores that hook, so without
    // this gate the transform would also run in the CLIENT build — where modules
    // like `@remix-run/server-runtime` sit in the client graph, and the injected
    // snippet's import of the subscriber factories (which import
    // `node:diagnostics_channel`) breaks against Vite's browser builtin shim. Gate
    // on the `ssr` flag, which Vite passes on both major versions.
    transform: gateTransform(upstream.transform, opts => !opts?.ssr || isDuplicate),
    // SSR-gated like the transform: the specifier only appears in SSR modules.
    async resolveId(source, importer, resolveOptions) {
      if (source !== SNIPPET_IMPORT_SPECIFIER) {
        return resolveExternalRequire.call(this, source, importer, resolveOptions);
      }
      return resolveOptions?.ssr ? resolveSnippetImport.call(this, source, importer, resolveOptions) : null;
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
      // Vite 6 calls this hook without a context.
      this: ConfigPluginContext | undefined,
      name: string,
      config: { consumer?: 'client' | 'server' },
      env?: ConfigEnv,
    ): EnvironmentOptions | null {
      if ((config.consumer ?? (name === 'client' ? 'client' : 'server')) !== 'server') {
        return null;
      }

      // `@cloudflare/vite-plugin` pre-bundles the dependencies of a Worker in `serve`. The dependency
      // optimizer runs no Vite plugins, so the transform has to run inside it. A Node server loads its
      // dependencies with Node, where the runtime hook instruments them.
      if (env?.command === 'serve') {
        if (!options.transformOptimizedDeps) {
          return null;
        }
        if (this?.meta?.rolldownVersion) {
          return {
            optimizeDeps: {
              rolldownOptions: { plugins: [depOptimizerRolldownPlugin(options, () => isDuplicateOptimizer)] },
            },
          };
        }
        return {
          optimizeDeps: {
            // Vite 6 and 7 have no `rolldownOptions`.
            // oxlint-disable-next-line typescript/no-deprecated
            esbuildOptions: { plugins: [depOptimizerEsbuildPlugin(options, () => isDuplicateOptimizer)] },
          },
        };
      }

      return { resolve: { noExternal: noExternalModules() } };
    },
    configResolved(config: ResolvedConfig): void {
      // Two Sentry Vite plugins can each add this plugin to one build, for example `sentryCloudflareVitePlugin` and
      // `sentryReactRouter`. A module transformed twice declares the injected snippet twice and fails the build.
      const instances = (config.plugins as readonly OrchestrionVitePlugin[]).flatMap(p => p[INSTANCE_KEY] ?? []);
      isDuplicate = instances[0] !== undefined && instances[0] !== instance;
      // The first instance can be one without `transformOptimizedDeps`, for example the one of `sentryReactRouter`
      // before `sentryCloudflareVitePlugin`.
      const firstOptimizer = instances.find(i => i.transformOptimizedDeps);
      isDuplicateOptimizer = firstOptimizer !== undefined && firstOptimizer !== instance;

      // Nothing is force-bundled in `serve`, so an externalized module is expected there.
      if (isDuplicate || config.command === 'serve') {
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

  return plugin;
}
