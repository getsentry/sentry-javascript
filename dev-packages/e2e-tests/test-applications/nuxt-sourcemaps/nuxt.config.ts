// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  imports: { autoImport: false },
  modules: ['@sentry/nuxt/module'],

  // Nuxt defaults to `{ server: true, client: false }`, which the module treats as "client maps
  // explicitly disabled". Enabling both covers the client (Vite) and server (Nitro) upload paths.
  sourcemap: { client: 'hidden', server: 'hidden' },

  sentry: {
    authToken: 'fake-auth-token',
    org: 'test-org',
    project: 'test-project',
    // Route every CLI/API request at the local mock Sentry server.
    sentryUrl: 'http://localhost:3032',
    release: {
      name: 'test-release',
    },
    sourcemaps: {
      // The maps must be gone from the deployable output once the build finishes, while the
      // uploaded bundles still carry them. `assert-build.ts` checks both.
      filesToDeleteAfterUpload: ['./.output/**/*.map'],
    },
    debug: true,
  },

  runtimeConfig: {
    public: {
      sentry: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },
});
