// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  modules: ['@sentry/nuxt/module'],
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      nodeCompat: true,
      deployConfig: false,
    },
    // The bundled `mysql` driver pulls in `readable-stream`, whose base `require('stream')` has no
    // usable prototype under Nitro's unenv polyfill (throws `superCtor.prototype ... undefined`).
    // Alias it to workerd's native `node:stream`, which has a real `Readable`.
    alias: {
      'readable-stream': 'node:stream',
    },
  },
});
