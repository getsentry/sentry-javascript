// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  imports: {
    autoImport: false,
  },
  nitro: {
    experimental: {
      database: true,
    },
  },
  runtimeConfig: {
    public: {
      sentry: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },
  nitro: {
    storage: {
      'test-storage': {
        driver: 'memory',
      },
    },
  },
});
