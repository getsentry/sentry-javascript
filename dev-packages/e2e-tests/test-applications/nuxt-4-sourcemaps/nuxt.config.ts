import * as fs from 'node:fs';

// Nuxt 4 defaults `sourcemap.client` to `false`, which the SDK respects as a deliberate opt-out, so
// an app that never mentions `sourcemap`, uploads nothing client-side. `'hidden'` is what the SDK's
// own warning tells users to set, which makes it the setup worth regression-testing.
const keepClientSourceMaps = process.env.E2E_KEEP_CLIENT_SOURCEMAPS === 'true';

// Without an auth token nothing is uploaded, but Sentry still removes the client maps it enabled.
const noUpload = process.env.E2E_NO_UPLOAD === 'true';

// With `sourcemap.client` unset, Sentry enables the client maps and removes them from the build output itself. The
// output directories differ per Nitro preset.
const nitroPreset = process.env.NITRO_PRESET;

type OutputBundle = Record<string, { type: string; fileName: string; code?: string }>;

// The bundler emits no map for a chunk without mappable source, such as Vue's export helper, so its debug ID
// cannot be uploaded.
// Recorded before the Sentry plugin removes the maps it enabled from the bundle.
function recordChunksWithoutSourceMap() {
  return {
    name: 'record-chunks-without-source-map',
    apply: 'build' as const,
    generateBundle(_options: unknown, bundle: OutputBundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.code || bundle[`${output.fileName}.map`]) {
          continue;
        }
        for (const match of output.code.matchAll(/sentry-dbid-([\da-f-]{36})/gi)) {
          fs.appendFileSync('.tmp_debug_ids_without_source_map', `${match[1]!.toLowerCase()}\n`);
        }
      }
    },
  };
}

export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  imports: { autoImport: false },

  sourcemap: { client: nitroPreset || noUpload ? undefined : 'hidden' },

  nitro: { preset: nitroPreset },

  vite: { plugins: [recordChunksWithoutSourceMap()] },

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
    authToken: noUpload ? undefined : 'fake-auth-token',
    org: 'test-org',
    project: 'test-project',
    release: { name: 'test-release' },
    // Dropping `filesToDeleteAfterUpload` is the whole point of the "kept" variant: Sentry should
    // upload the maps and leave the emitted files alone.
    sourcemaps:
      keepClientSourceMaps || nitroPreset || noUpload ? {} : { filesToDeleteAfterUpload: ['.output/public/**/*.map'] },
    debug: true,
  },
});
