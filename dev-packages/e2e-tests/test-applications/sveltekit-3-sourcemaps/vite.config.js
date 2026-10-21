import adapter from '@sveltejs/adapter-node';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import * as fs from 'node:fs';
import { defineConfig } from 'vite';

// Rolldown emits no map for chunks without mappable source (e.g. Vite's preload helper), so their debug
// IDs can't be uploaded. Recorded here because the SDK deletes all maps after the upload.
function recordChunksWithoutSourceMap() {
  return {
    name: 'record-chunks-without-source-map',
    apply: 'build',
    enforce: 'post',
    writeBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || bundle[`${output.fileName}.map`]) {
          continue;
        }
        for (const match of output.code.matchAll(/sentry-dbid-([\da-f-]{36})/gi)) {
          fs.appendFileSync('.tmp_debug_ids_without_source_map', `${match[1].toLowerCase()}\n`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      sentryUrl: 'http://localhost:3032',
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
    }),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
    }),
    recordChunksWithoutSourceMap(),
  ],
});
