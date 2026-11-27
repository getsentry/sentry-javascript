import { sentryVitePlugin } from '@sentry/node/vite';
import { defineConfig } from 'vite';
import { voidPlugin } from 'void';

export default defineConfig({
  plugins: [
    voidPlugin(),
    // Void bundles Hono into the server build, so the Sentry plugin instruments it at build time.
    // No auth token, so nothing is uploaded.
    sentryVitePlugin({
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false, finalize: false, inject: false },
    }),
  ],
});
