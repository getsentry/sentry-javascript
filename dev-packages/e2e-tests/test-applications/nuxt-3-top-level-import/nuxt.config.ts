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
  sentry: {
    autoInjectServerSentry: 'top-level-import',
  },
});
