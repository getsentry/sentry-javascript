// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  imports: { autoImport: false },

  routeRules: {
    '/rendering-modes/client-side-only-page': { ssr: false },
    '/rendering-modes/isr-cached-page': { isr: true },
    '/rendering-modes/isr-1h-cached-page': { isr: 3600 },
    '/rendering-modes/swr-cached-page': { swr: true },
    '/rendering-modes/swr-1h-cached-page': { swr: 3600 },
    '/rendering-modes/pre-rendered-page': { prerender: true },
  },

  modules: ['@pinia/nuxt', '@sentry/nuxt/module'],
  runtimeConfig: {
    public: {
      sentry: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },
  nitro: {
    experimental: {
      database: true,
    },
    database: {
      default: {
        connector: 'sqlite',
        options: { name: 'db' },
      },
      users: {
        connector: 'sqlite',
        options: { name: 'users_db' },
      },
      analytics: {
        connector: 'sqlite',
        options: { name: 'analytics_db' },
      },
    },
    storage: {
      'test-storage': {
        driver: 'memory',
      },
    },
  },
});
