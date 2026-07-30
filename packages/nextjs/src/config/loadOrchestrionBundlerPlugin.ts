import { loadModule } from '@sentry/core';
// Type-only imports: erased at compile time so the module graph of the runtime server entry
// (`index.server.ts` → `withSentryConfig` → …) never statically reaches
// `@sentry/server-utils/orchestrion/webpack`. That subpath bundles the code-transformer bundler
// plugin, whose vendored core compiles a WASM lexer at module-evaluation time. On Cloudflare
// Workers runtime WASM compilation is forbidden, so a static import made every cold start throw a
// `CompileError`; elsewhere it was silent bundle weight. See #22794.
import type {
  getOrchestrionLoaderPath,
  getSentryInstrumentations,
  resolveOrchestrionRuntimeRequest,
  sentryOrchestrionWebpackPlugin,
  serializeInstrumentations,
} from '@sentry/server-utils/orchestrion/webpack';

type OrchestrionWebpackModule = {
  getOrchestrionLoaderPath: typeof getOrchestrionLoaderPath;
  getSentryInstrumentations: typeof getSentryInstrumentations;
  resolveOrchestrionRuntimeRequest: typeof resolveOrchestrionRuntimeRequest;
  sentryOrchestrionWebpackPlugin: typeof sentryOrchestrionWebpackPlugin;
  serializeInstrumentations: typeof serializeInstrumentations;
};

/**
 * Loads `@sentry/server-utils/orchestrion/webpack` at build time via a runtime require rather than
 * a static import. This mirrors how the Sentry sourcemap plugin (`@sentry/bundler-plugins/webpack`)
 * is loaded in `webpack.ts` — both are build-time-only and must stay out of the runtime server
 * bundle's static module graph.
 *
 * Callers run exclusively inside `withSentryConfig`'s bundler-config functions (never at module
 * scope), so the deferred load resolves the same way the static import did during a real build.
 */
export function loadOrchestrionBundlerPlugin(): OrchestrionWebpackModule | undefined {
  return loadModule<OrchestrionWebpackModule>('@sentry/server-utils/orchestrion/webpack', module);
}
