// EXPERIMENTAL — orchestrion code-transform loader + webpack plugin. The loader is exposed
// separately because Turbopack can only take webpack loaders (via `turbopack.rules`), not plugins.

import { createRequire } from 'node:module';
import type { Compiler } from 'webpack';
import type { InstrumentationConfig } from '..';
import { instrumentedModuleNames, SENTRY_INSTRUMENTATIONS } from '../config';
import codeTransformerWebpack from '@apm-js-collab/code-transformer-bundler-plugins/webpack';
import type { PluginOptions } from './options';

export { serializeInstrumentations } from '@apm-js-collab/code-transformer-bundler-plugins/core';
export type { SerializableInstrumentationConfig } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';

// Both branches use `createRequire` (never alias the CJS `require`) so bundlers consuming this
// module don't emit a "Critical dependency" warning.
function getOrchestrionRequire(): ReturnType<typeof createRequire> {
  let nodeRequire: ReturnType<typeof createRequire>;
  /*! rollup-include-cjs-only */
  nodeRequire = createRequire(__filename);
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  nodeRequire = createRequire(import.meta.url);
  /*! rollup-include-esm-only-end */
  return nodeRequire;
}

/** Absolute path to the code-transform loader (a webpack loader; also usable as a Turbopack loader). */
export function getOrchestrionLoaderPath(): string {
  return getOrchestrionRequire().resolve('@apm-js-collab/code-transformer-bundler-plugins/webpack-loader');
}

/**
 * Resolves a request for one of the orchestrion runtime packages (`@sentry/server-utils` itself, via
 * self-reference, or its `@apm-js-collab/*` dependencies) to an absolute path, from this package's
 * own on-disk location — where the whole dependency graph always resolves, regardless of the
 * consuming app's install layout. Returns `undefined` when the request can't be resolved.
 *
 * Bundler configs use this to emit absolute-path `commonjs` externals: a bare-specifier external
 * emitted into a bundled chunk resolves from the chunk's output location at runtime, which fails
 * under isolated installs (pnpm) where these packages are transitive dependencies.
 */
export function resolveOrchestrionRuntimeRequest(request: string): string | undefined {
  try {
    return getOrchestrionRequire().resolve(request);
  } catch {
    return undefined;
  }
}

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

/**
 * The code-transform webpack plugin, pre-fed the instrumentation config.
 *
 * Instrumented packages marked as `externals` never pass through the code
 * transform, so a compilation warning is emitted for them.
 */
export function sentryOrchestrionWebpackPlugin(options: PluginOptions = {}): ReturnType<typeof codeTransformerWebpack> {
  const plugin = codeTransformerWebpack(orchestrionTransformOptions(options));
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
    apply(compiler);
  };
  return plugin;
}
