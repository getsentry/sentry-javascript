// https://nuxt.com/docs/api/configuration/nuxt-config
const tunnelVariant = !!process.env.E2E_TEST_TUNNEL;

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
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
        // The tunnel variant forwards to the test proxy, so the DSN has to point there.
        dsn: tunnelVariant ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337',
      },
      e2eTunnel: tunnelVariant,
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
