// https://nuxt.com/docs/api/configuration/nuxt-config
const tunnelVariant = !!process.env.E2E_TEST_TUNNEL;
// The runtime variants set `RUNTIME` for the build, see dev-packages/e2e-tests/README.md.
const runtime = process.env.RUNTIME || 'node';
const cloudflare = runtime === 'cloudflare';

// `node:sqlite` is not available on Bun, which has its own SQLite module, and on Cloudflare, which has D1.
function database(name: string, binding: string) {
  if (cloudflare) {
    return { connector: 'cloudflare-d1', options: { bindingName: binding } };
  }
  return { connector: runtime === 'bun' ? 'bun-sqlite' : 'sqlite', options: { name } };
}

export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  imports: { autoImport: false },
  ...(process.env.E2E_TEST_VITE_SERVER && { server: { builder: 'vite' } }),

  routeRules: {
    '/rendering-modes/client-side-only-page': { ssr: false },
    '/rendering-modes/isr-cached-page': { isr: true },
    '/rendering-modes/isr-1h-cached-page': { isr: 3600 },
    '/rendering-modes/swr-cached-page': { swr: true },
    '/rendering-modes/swr-1h-cached-page': { swr: 3600 },
    '/rendering-modes/pre-rendered-page': { prerender: true },
    // A headers rule on every path, like a security headers setup, also covers the tunnel's path.
    ...(tunnelVariant && { '/**': { headers: { 'x-e2e-route-rule': '1' } } }),
  },

  // The base-path variant serves the app, and so the tunnel, under `/app`.
  ...(process.env.E2E_TEST_BASE_PATH && { app: { baseURL: `${process.env.E2E_TEST_BASE_PATH}/` } }),

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
    ...(cloudflare && {
      preset: 'cloudflare_module',
      cloudflare: { nodeCompat: true, deployConfig: false },
      // Sets up the SDK on Cloudflare, where the Nitro preset does not use `sentry.server.config.ts`.
      plugins: ['~~/cloudflare/sentry.ts'],
      // The bundled `mysql` driver pulls in `readable-stream`, whose base `require('stream')` has no
      // usable prototype under Nitro's unenv polyfill (throws `superCtor.prototype ... undefined`).
      // Alias it to workerd's native `node:stream`, which has a real `Readable`.
      alias: { 'readable-stream': 'node:stream' },
    }),
    // Files for one runtime replace their counterpart in the copy of the app for that runtime, see
    // dev-packages/e2e-tests/README.md, and are no routes of their own.
    ignore: ['**/*.cloudflare.ts'],
    // A Worker has no access to the env vars of the test run, so the tunnel variant is set at build time.
    replace: { __E2E_TEST_TUNNEL__: JSON.stringify(tunnelVariant) },
    experimental: {
      database: true,
    },
    database: {
      default: database('db', 'DB'),
      users: database('users_db', 'USERS_DB'),
      analytics: database('analytics_db', 'ANALYTICS_DB'),
    },
    storage: {
      'test-storage': {
        driver: 'memory',
      },
    },
  },
});
