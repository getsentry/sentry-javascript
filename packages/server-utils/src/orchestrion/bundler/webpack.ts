// Orchestrion code-transform loader + webpack plugin. The loader is exposed
// separately because Turbopack can only take webpack loaders (via `turbopack.rules`), not plugins.

import { SDK_VERSION } from '@sentry/core';
import type { Compiler } from 'webpack';
import type { InstrumentationConfig } from '..';
import { instrumentedModuleNames, SENTRY_INSTRUMENTATIONS } from '../config';
import codeTransformerWebpack from '@apm-js-collab/code-transformer-bundler-plugins/webpack';
import type { PluginOptions } from './options';
import { getOrchestrionLoaderPath, resolveOrchestrionRuntimeRequest } from './resolve';

import { serializeInstrumentations as serializeInstrumentationsImpl } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import type { AnyInstrumentationConfig, SerializableInstrumentationConfig } from '../apmTypes';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';

// Explicitly annotated with the vendored types so the emitted declaration doesn't reference
// `@apm-js-collab/code-transformer-bundler-plugins` — a bundled devDependency consumers don't have.
export const serializeInstrumentations: (configs: AnyInstrumentationConfig[]) => SerializableInstrumentationConfig[] =
  serializeInstrumentationsImpl;
export type { SerializableInstrumentationConfig } from '../apmTypes';

export { getOrchestrionLoaderPath, resolveOrchestrionRuntimeRequest };

/** The central instrumentation config, to pass as the loader's `instrumentations` option. */
export function getSentryInstrumentations(): InstrumentationConfig[] {
  return SENTRY_INSTRUMENTATIONS;
}

// Handles the declarative `externals` shapes (string, RegExp, object, arrays
// thereof). Function externals (e.g. webpack-node-externals) are skipped: they
// may resolve asynchronously, so they can't be probed reliably here.
function externalizedWebpackModules(externals: unknown, moduleNames: string[]): string[] {
  const entries = Array.isArray(externals) ? externals : [externals];
  return moduleNames.filter(name =>
    entries.some(entry => {
      if (typeof entry === 'string') {
        return externalEntryMatchesModule(entry, name);
      }
      if (entry instanceof RegExp) {
        return entry.test(name);
      }
      if (entry && typeof entry === 'object') {
        return name in entry;
      }
      return false;
    }),
  );
}

// The injected module-injected snippet imports `@sentry/server-utils/orchestrion`
// from INSIDE transformed `node_modules` files. Under isolated installs (pnpm)
// that bare specifier doesn't resolve from an instrumented package's location,
// so map it (exact-match, hence the `$`) to this package's own resolution.
// Externals still win — webpack consults `externals` before resolving — so
// setups that externalize the runtime (e.g. Next.js) are unaffected.
function addOrchestrionResolveAlias(compiler: Compiler): void {
  const resolveOptions = (compiler.options.resolve ??= {});
  const alias = resolveOptions.alias;
  if (Array.isArray(alias)) {
    return;
  }

  const aliasMap = (resolveOptions.alias = alias ?? {});
  if (!('@sentry/server-utils/orchestrion$' in aliasMap)) {
    const resolved = resolveOrchestrionRuntimeRequest('@sentry/server-utils/orchestrion');
    if (resolved) {
      aliasMap['@sentry/server-utils/orchestrion$'] = resolved;
    }
  }
}

/**
 * The code-transform webpack plugin, pre-fed the instrumentation config.
 *
 * Instrumented packages marked as `externals` never pass through the code
 * transform, so a compilation warning is emitted for them.
 */
export function sentryOrchestrionWebpackPlugin(options: PluginOptions = {}): { apply(compiler: Compiler): void } {
  if (options.buildTimeInstrumentation === false) {
    // Inert plugin — no code transform, so no instrumentation lands in the bundle.
    return { apply: () => undefined };
  }

  const plugin = codeTransformerWebpack({
    ...orchestrionTransformOptions(options),
    // The upstream plugin's own loader path points into our `vendored/` tree at
    // a file rollup never emitted; use our bundled loader entrypoint instead
    // (which also bakes in the module-injected transform for Turbopack).
    loaderPath: getOrchestrionLoaderPath(),
    // The loader ident hashes the instrumentations and each custom transform's
    // source text, but not data a transform reads without naming it — our
    // subscriber-definitions table. Key persistent caches on the SDK version so
    // a release changing that table busts them.
    cacheVersion: SDK_VERSION,
  });
  const moduleNames = instrumentedModuleNames(options.instrumentations);
  // The upstream plugin is a class instance, so `apply` is overridden in place
  // rather than spread into a new object (which would lose prototype methods).
  const apply = plugin.apply.bind(plugin);
  plugin.apply = (compiler: Compiler): void => {
    const externalizedModules = externalizedWebpackModules(compiler.options.externals, moduleNames);
    if (externalizedModules.length > 0) {
      compiler.hooks.thisCompilation.tap('SentryOrchestrionExternalsCheck', compilation => {
        compilation.warnings.push(new compiler.webpack.WebpackError(externalizedModulesWarning(externalizedModules)));
      });
    }
    addOrchestrionResolveAlias(compiler);
    apply(compiler);
  };
  return plugin;
}
