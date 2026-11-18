// https://nuxt.com/docs/api/configuration/nuxt-config
// The inject mode variants set `E2E_TEST_INJECT_MODE` for the build and the test run.
const injectMode = process.env.E2E_TEST_INJECT_MODE as 'top-level-import' | 'experimental_dynamic-import' | undefined;

export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  sentry: {
    autoInjectServerSentry: injectMode,
  },
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
