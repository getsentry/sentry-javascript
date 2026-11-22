// https://nuxt.com/docs/api/configuration/nuxt-config
// The runtime variants set `RUNTIME` for the build, see dev-packages/e2e-tests/README.md.
const runtime = process.env.RUNTIME || 'node';
const cloudflare = runtime === 'cloudflare';

// `node:sqlite` is not available on Bun, which has its own SQLite module, and on Cloudflare, which has D1.
function database(name: string, binding: string) {
  if (cloudflare) {
    return { connector: 'cloudflare-d1', options: { bindingName: binding } } as const;
  }
  return { connector: runtime === 'bun' ? 'bun-sqlite' : 'sqlite', options: { name } } as const;
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
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
    ...(cloudflare && {
      // The Sentry module sets up the SDK from `instrument.server.ts`, because the Nitro preset does not use
      // `sentry.server.config.ts`.
      preset: 'cloudflare_module',
      cloudflare: { nodeCompat: true, deployConfig: false },
    }),
    // Files for one runtime replace their counterpart in the copy of the app for that runtime, see
    // dev-packages/e2e-tests/README.md, and are no routes of their own.
    ignore: ['**/*.cloudflare.ts'],
    ...(process.env.E2E_TEST_CACHE_DRIVER && { cache: { driver: process.env.E2E_TEST_CACHE_DRIVER } }),
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
