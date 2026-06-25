// import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@sentry/nuxt/module'],

  runtimeConfig: {
    public: {
      sentry: {
        /// dsn: 'https://e88b32b2db8229c9b7b693337bd60a12@o447951.ingest.us.sentry.io/4507486945738752'
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },

  // Build-time injection for *bundled* deps. Not needed here: `mysql` stays external, so the
  // runtime hook covers it. Enable only if instrumented deps get bundled into the server output.
  // vite: {
  //    plugins: [...sentryOrchestrionPlugin()],
  // },
});
