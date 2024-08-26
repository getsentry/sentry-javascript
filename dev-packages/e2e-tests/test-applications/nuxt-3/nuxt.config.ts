// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  imports: {
    autoImport: false,
  },
});
