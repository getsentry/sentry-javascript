import { sentrySolidStart } from '@sentry/solidstart/vite';
import { solidStart } from '@solidjs/start/config';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import * as fs from 'node:fs';

// Rolldown emits no map for chunks without mappable source (e.g. Vite's preload helper), so their debug
// IDs can't be uploaded. Recorded here because the SDK deletes all maps after the upload.
function recordChunksWithoutSourceMap() {
  return {
    name: 'record-chunks-without-source-map',
    apply: 'build' as const,
    enforce: 'post' as const,
    writeBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; code?: string }>) {
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

export default defineConfig({
  plugins: [
    solidStart({
      appRoot: './src',
      middleware: './src/middleware.ts',
    }),
    sentrySolidStart({
      sentryUrl: 'http://localhost:3032',
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
    }),
    // `serverDir` defaults to `false`, which skips plugin scanning entirely.
    nitro({ serverDir: './server' }),
    recordChunksWithoutSourceMap(),
  ],
});
