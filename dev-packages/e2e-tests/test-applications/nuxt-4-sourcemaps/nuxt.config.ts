// Nuxt 4 defaults `sourcemap.client` to `false`, which the SDK respects as a deliberate opt-out, so
// an app that never mentions `sourcemap`, uploads nothing client-side. `'hidden'` is what the SDK's
// own warning tells users to set, which makes it the setup worth regression-testing.
const keepClientSourceMaps = process.env.E2E_KEEP_CLIENT_SOURCEMAPS === 'true';

export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  imports: { autoImport: false },

  sourcemap: { client: 'hidden' },

  modules: ['@sentry/nuxt/module'],

  runtimeConfig: {
    public: {
      sentry: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      },
    },
  },

  sentry: {
    sentryUrl: 'http://localhost:3032',
    authToken: 'fake-auth-token',
    org: 'test-org',
    project: 'test-project',
    release: { name: 'test-release' },
    // Dropping `filesToDeleteAfterUpload` is the whole point of the "kept" variant: Sentry should
    // upload the maps and leave the emitted files alone.
    sourcemaps: keepClientSourceMaps ? {} : { filesToDeleteAfterUpload: ['.output/public/**/*.map'] },
    debug: true,
  },
});
