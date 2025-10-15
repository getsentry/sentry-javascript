// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  imports: {
    autoImport: false,
  },
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
