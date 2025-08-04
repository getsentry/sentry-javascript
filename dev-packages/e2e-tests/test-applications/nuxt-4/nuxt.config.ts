// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  imports: { autoImport: false },

  routeRules: {
    '/rendering-modes/client-side-only-page': { ssr: false },
    '/rendering-modes/pre-rendered-page': { prerender: true },
    '/rendering-modes/swr-cached-page': { swr: true },
    '/rendering-modes/swr-1h-cached-page': { swr: 3600 },
    '/rendering-modes/isr-cached-page': { isr: true },
    '/rendering-modes/isr-1h-cached-page': { isr: 3600 },
  },

  modules: ['@pinia/nuxt', '@sentry/nuxt/module'],

  runtimeConfig: {
    public: {
      sentry: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },
});
