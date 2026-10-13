import { fileURLToPath } from 'node:url';

// The MongoDB driver loads these optional dependencies only for features the app does not use, and they are not
// installed. The Worker bundle must contain every dependency, so they resolve to an empty module.
const MONGODB_OPTIONAL_DEPENDENCIES = [
  '@aws-sdk/credential-providers',
  '@mongodb-js/zstd',
  'gcp-metadata',
  'kerberos',
  'mongodb-client-encryption',
  'snappy',
  'socks',
];
const EMPTY_MODULE = fileURLToPath(new URL('./empty-module.mjs', import.meta.url));

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
    // Like `cloudflare_module`, and also exports the `$DurableObject` class from the Worker.
    preset: 'cloudflare_durable',
    cloudflare: {
      nodeCompat: true,
      deployConfig: false,
    },
    // The bundled `mysql` driver pulls in `readable-stream`, whose base `require('stream')` has no
    // usable prototype under Nitro's unenv polyfill (throws `superCtor.prototype ... undefined`).
    // Alias it to workerd's native `node:stream`, which has a real `Readable`.
    alias: {
      'readable-stream': 'node:stream',
      ...Object.fromEntries(MONGODB_OPTIONAL_DEPENDENCIES.map(dependency => [dependency, EMPTY_MODULE])),
    },
    experimental: {
      database: true,
    },
    // The `sqlite` connector needs Node.js APIs that workerd does not have. The D1 bindings are in `wrangler.jsonc`.
    database: {
      default: {
        connector: 'cloudflare-d1',
        options: { bindingName: 'DB' },
      },
      users: {
        connector: 'cloudflare-d1',
        options: { bindingName: 'USERS_DB' },
      },
      analytics: {
        connector: 'cloudflare-d1',
        options: { bindingName: 'ANALYTICS_DB' },
      },
    },
    storage: {
      'test-storage': {
        driver: 'memory',
      },
    },
  },
});
