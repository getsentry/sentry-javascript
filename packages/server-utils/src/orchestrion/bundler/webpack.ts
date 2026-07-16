// EXPERIMENTAL — orchestrion code-transform loader + webpack plugin. The loader is exposed
// separately because Turbopack can only take webpack loaders (via `turbopack.rules`), not plugins.

import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import codeTransformerWebpack from '@apm-js-collab/code-transformer-bundler-plugins/webpack';
import type { PluginOptions } from './options';
import { orchestrionTransformOptions } from './options';

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
 * Absolute path to the `@apm-js-collab/tracing-hooks` package directory, resolved from this
 * package's own dependency graph. SDKs inject it at build time so the runtime module hook can
 * load the package even where the bare specifier doesn't resolve (bundled SDK code under
 * isolated installs, e.g. pnpm).
 */
export function getTracingHooksDirectory(): string {
  const packageJsonPath = getOrchestrionRequire().resolve('@apm-js-collab/tracing-hooks/package.json');
  // This avoids any backslash-escaping concerns on Windows
  return dirname(packageJsonPath).replace(/\\/g, '/');
}

/** The central instrumentation config, to pass as the loader's `instrumentations` option. */
export function getSentryInstrumentations(): InstrumentationConfig[] {
  return SENTRY_INSTRUMENTATIONS;
}

/**
 * The code-transform webpack plugin, pre-fed the instrumentation config
 */
export function sentryOrchestrionWebpackPlugin(options: PluginOptions): ReturnType<typeof codeTransformerWebpack> {
  return codeTransformerWebpack(orchestrionTransformOptions(options));
}
