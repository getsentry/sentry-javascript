import { sentrySolidStart } from '@sentry/solidstart/vite';
import { solidStart } from '@solidjs/start/config';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import * as fs from 'node:fs';

// Rolldown emits no map for chunks without mappable source (e.g. Vite's preload helper), so their debug
// IDs can't be uploaded. Recorded before the bundler plugin removes the maps from the bundle.
function recordChunksWithoutSourceMap() {
  return {
    name: 'record-chunks-without-source-map',
    apply: 'build' as const,
    enforce: 'post' as const,
    generateBundle: {
      order: 'pre' as const,
      handler(_options: unknown, bundle: Record<string, { type: string; fileName: string; code?: string }>) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk' || !output.code || bundle[`${output.fileName}.map`]) {
            continue;
          }
          for (const match of output.code.matchAll(/sentry-dbid-([\da-f-]{36})/gi)) {
            fs.appendFileSync('.tmp_debug_ids_without_source_map', `${match[1]!.toLowerCase()}\n`);
          }
        }
      },
    },
  };
}

// `manual-upload`: Sentry uploads nothing and keeps the maps it turned on, for an upload with the CLI.
// `delete-all`: the app turns source maps on itself, and Sentry removes them.
const variant = process.env.E2E_VARIANT;

export default defineConfig({
  build: variant === 'delete-all' ? { sourcemap: true } : undefined,
  plugins: [
    solidStart({
      appRoot: './src',
      middleware: './src/middleware.ts',
    }),
    sentrySolidStart({
      sentryUrl: 'http://localhost:3032',
      authToken: process.env.E2E_NO_UPLOAD ? undefined : 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
      sourcemaps:
        variant === 'manual-upload'
          ? { upload: false, delete: false }
          : variant === 'delete-all'
            ? { delete: true }
            : undefined,
    }),
    // `serverDir` defaults to `false`, which skips plugin scanning entirely.
    nitro({ serverDir: './server' }),
    recordChunksWithoutSourceMap(),
  ],
});
