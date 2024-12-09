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
    rollupConfig: {
      // @sentry/... is set external to prevent bundling all of Sentry into the `runtime.mjs` file in the build output
      external: [/@sentry\/.*/],
    },
  },
  sentry: {
    autoInjectServerSentry: 'top-level-import',
  },
});
