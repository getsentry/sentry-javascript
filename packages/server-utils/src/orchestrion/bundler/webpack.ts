// EXPERIMENTAL — orchestrion code-transform loader + webpack plugin. The loader is exposed
// separately because Turbopack can only take webpack loaders (via `turbopack.rules`), not plugins.

import { createRequire } from 'node:module';
import type { Compiler } from 'webpack';
import type { InstrumentationConfig } from '..';
import { instrumentedModuleNames, SENTRY_INSTRUMENTATIONS } from '../config';
import codeTransformerWebpack from '@apm-js-collab/code-transformer-bundler-plugins/webpack';
import type { PluginOptions } from './options';

import { serializeInstrumentations as serializeInstrumentationsImpl } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import type { AnyInstrumentationConfig, SerializableInstrumentationConfig } from '../apmTypes';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';

// Explicitly annotated with the vendored types so the emitted declaration doesn't reference
// `@apm-js-collab/code-transformer-bundler-plugins` — a bundled devDependency consumers don't have.
export const serializeInstrumentations: (configs: AnyInstrumentationConfig[]) => SerializableInstrumentationConfig[] =
  serializeInstrumentationsImpl;
export type { SerializableInstrumentationConfig } from '../apmTypes';

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

/**
 * Absolute path to the code-transform loader (a webpack loader; also usable as a Turbopack loader).
 * Resolved via self-reference to this package's own bundled copy — the `@apm-js-collab` packages
 * are bundled devDependencies and not resolvable on user installs.
 */
export function getOrchestrionLoaderPath(): string {
  return getOrchestrionRequire().resolve('@sentry/server-utils/orchestrion/webpack-loader');
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

// The upstream plugin computes its loader path relative to its own file location, which after
// bundling points into our `vendored/` tree at a file rollup never emitted. Replace it in the
// rule the plugin just unshifted with our own bundled loader entrypoint.
function fixupLoaderPath(compiler: Compiler): void {
  for (const rule of compiler.options.module?.rules ?? []) {
    if (!rule || typeof rule !== 'object' || !('use' in rule) || !Array.isArray(rule.use)) {
      continue;
    }
    for (const use of rule.use) {
      if (
        use &&
        typeof use === 'object' &&
        typeof use.loader === 'string' &&
        use.loader.endsWith('webpack-loader.cjs')
      ) {
        use.loader = getOrchestrionLoaderPath();
      }
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
    fixupLoaderPath(compiler);
  };
  return plugin;
}
