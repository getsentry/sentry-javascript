import codeTransformerRollup from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import { INSTRUMENTED_MODULE_NAMES, SENTRY_INSTRUMENTATIONS } from '@sentry/server-utils/orchestrion/config';

// Tells the SDK the orchestrion bundler transform ran, so `detectOrchestrionSetup()`
// no-ops the runtime diagnostics-channel hook. Injected via `codeTransformerRollup`'s
// `injectDiagnostics` option (sourcemap-safe) instead of a hand-rolled plugin.
const orchestrionBundlerMarker = [
  'globalThis.__SENTRY_ORCHESTRION__ = (globalThis.__SENTRY_ORCHESTRION__ || {});',
  'globalThis.__SENTRY_ORCHESTRION__.bundler = true;',
  '',
].join('\n');

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
    // routes. Force-bundle the instrumented deps via `externals.inline`;
    // externalized deps are `require()`d from `node_modules` at runtime and never
    // pass through the transform.
    //
    // `standard-as-callback` is ioredis' CJS `export default` helper used by
    // `connect()`. Left external, Rollup's interop resolves its `.default` to a
    // non-function in the bundle; inlining it alongside ioredis links the
    // interop consistently.
    externals: {
      inline: [...INSTRUMENTED_MODULE_NAMES, 'standard-as-callback'],
    },
    rollupConfig: {
      plugins: [
        codeTransformerRollup({
          instrumentations: SENTRY_INSTRUMENTATIONS,
          injectDiagnostics: () => orchestrionBundlerMarker,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
      ],
    },
  },
});
