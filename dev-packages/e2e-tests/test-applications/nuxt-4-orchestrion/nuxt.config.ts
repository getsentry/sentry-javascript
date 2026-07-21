// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@sentry/nuxt/module'],

  sentry: {
    _experimental: {
      useDiagnosticsChannelInjection: true,
    },
    autoInjectServerSentry: 'top-level-import',
  },

  runtimeConfig: {
    public: {
      sentry: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },
});
