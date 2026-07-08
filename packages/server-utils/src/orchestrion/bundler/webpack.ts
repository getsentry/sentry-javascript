// EXPERIMENTAL — orchestrion code-transform loader + webpack plugin. Consumed by SDKs whose bundler
// takes a webpack-compatible loader: webpack directly, and Turbopack via `turbopack.rules` (Turbopack
// can't load webpack *plugins*, only loaders, so the loader path is exposed for that path).
//
// Published dual (ESM + CJS) via `@sentry/server-utils/orchestrion/webpack` since consumers (e.g. a
// Next.js `next.config`) may load either format. The `@apm-js-collab/code-transformer-bundler-plugins`
// deps are resolved from THIS package's own graph (they're direct deps here), so consumers don't have
// to reach into a transitive dependency.

import { createRequire } from 'node:module';
import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { SENTRY_INSTRUMENTATIONS } from '../config';

// Resolve the bundler-plugins package from this module regardless of ESM/CJS output.
function getOrchestrionRequire(): ReturnType<typeof createRequire> {
  let nodeRequire: ReturnType<typeof createRequire>;
  /*! rollup-include-cjs-only */
  nodeRequire = require;
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

/** The central instrumentation config, to pass as the loader's `instrumentations` option. */
export function getSentryInstrumentations(): InstrumentationConfig[] {
  return SENTRY_INSTRUMENTATIONS;
}

/**
 * The code-transform webpack plugin (for `next build --webpack`), pre-fed the instrumentation config.
 *
 * Intentionally does NOT inject the `__SENTRY_ORCHESTRION__.bundler` marker (unlike the Vite plugin):
 * in a Next.js build, bundle-unsafe packages (e.g. `mysql`) stay externalized and rely on the runtime
 * module hook, which `registerDiagnosticsChannelInjection()` skips when the bundler marker is set. The
 * hybrid setup (bundler transform for bundled deps + runtime hook for external ones) needs both active.
 */
export function sentryOrchestrionWebpackPlugin(): unknown {
  const mod = getOrchestrionRequire()('@apm-js-collab/code-transformer-bundler-plugins/webpack') as {
    default?: (options: { instrumentations: InstrumentationConfig[] }) => unknown;
  };
  const codeTransformerWebpack = mod.default ?? (mod as unknown as NonNullable<typeof mod.default>);
  return codeTransformerWebpack({ instrumentations: SENTRY_INSTRUMENTATIONS });
}
