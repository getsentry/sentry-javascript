// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2024-04-03',
  imports: { autoImport: false },

  modules: ['@pinia/nuxt', '@sentry/nuxt/module'],

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
});
