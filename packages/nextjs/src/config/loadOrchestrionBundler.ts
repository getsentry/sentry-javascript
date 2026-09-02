import { createRequire } from 'module';
import type * as orchestrionBundler from '@sentry/server-utils/orchestrion/webpack';

type OrchestrionBundlerModule = typeof orchestrionBundler;

// Use `createRequire` (never the CJS `require` alias) so bundlers don't emit a "Critical
// dependency" warning. Resolving from this file's own location keeps it working under pnpm
// isolated installations.
function getNodeRequire(): ReturnType<typeof createRequire> {
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
 * Loads `@sentry/server-utils/orchestrion/webpack` at call time instead of module scope. The
 * runtime server entry re-exports `withSentryConfig`, so a static import would run the bundler
 * plugins' module-scope side effects on every server-side SDK import (issues #23789, #22794).
 * Synchronous because Next.js `webpack` config functions cannot be async. Node's require cache
 * already returns the same module on repeated calls, so no memoization is needed.
 */
export function loadOrchestrionBundler(): OrchestrionBundlerModule {
  return getNodeRequire()('@sentry/server-utils/orchestrion/webpack') as OrchestrionBundlerModule;
}
