import codeTransformerRollup from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import { INSTRUMENTED_MODULE_NAMES, SENTRY_INSTRUMENTATIONS } from '@sentry/server-utils/orchestrion/config';

// Mirrors the marker that `sentryOrchestrionPlugin()` (the Vite plugin) prepends to entry chunks.
const orchestrionBundlerMarker = {
  name: 'sentry-orchestrion-marker',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderChunk(code: string, chunk: any): { code: string; map: null } | null {
    if (!chunk.isEntry) {
      return null;
    }
    const banner =
      'globalThis.__SENTRY_ORCHESTRION__=(globalThis.__SENTRY_ORCHESTRION__||{});globalThis.__SENTRY_ORCHESTRION__.bundler=true;\n';
    return { code: banner + code, map: null };
  },
};

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@sentry/nuxt/module', './modules/sentry-server-init'],

  runtimeConfig: {
    public: {
      sentry: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },

  nitro: {
    // Nuxt's server is built by Nitro (Rollup), not Vite — so the orchestrion
    // code transform has to run as a Nitro Rollup plugin to reach `server/api/*`
    // routes. Force-bundle ONLY the instrumented deps (`mysql`) via
    // `externals.inline`; externalized deps are `require()`d from `node_modules`
    // at runtime and never pass through the transform.
    externals: {
      inline: INSTRUMENTED_MODULE_NAMES,
    },
    rollupConfig: {
      plugins: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        codeTransformerRollup({ instrumentations: SENTRY_INSTRUMENTATIONS }) as any,
        orchestrionBundlerMarker,
      ],
    },
  },
});
