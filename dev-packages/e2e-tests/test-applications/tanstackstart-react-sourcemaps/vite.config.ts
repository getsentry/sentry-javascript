import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { nitro } from 'nitro/vite';
import * as fs from 'node:fs';
import { defineConfig } from 'vite';

// A chunk without mappable source, such as Nitro's runtime, gets a debug ID but no source map to
// upload. Recorded before the Sentry plugin removes the maps in its own `generateBundle` hook.
function recordChunksWithoutSourceMap() {
  return {
    name: 'record-chunks-without-source-map',
    apply: 'build' as const,
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
    // Prerendering and the SPA shell render pages at build time, which must carry the release as well.
    tanstackStart({ prerender: { enabled: true }, pages: [{ path: '/prerendered' }], spa: { enabled: true } }),
    nitro(),
    viteReact(),
    recordChunksWithoutSourceMap(),
    sentryTanstackStart({
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
  ],
});
