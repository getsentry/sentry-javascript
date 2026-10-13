import { sentrySolidStart } from '@sentry/solidstart/vite';
import { solidStart } from '@solidjs/start/config';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    solidStart({
      appRoot: './src',
      middleware: './src/middleware.ts',
    }),
    sentrySolidStart({
      org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
      project: process.env.E2E_TEST_SENTRY_PROJECT,
      authToken: process.env.E2E_TEST_AUTH_TOKEN,
      debug: true,
    }),
    // `serverDir` defaults to `false`, which skips plugin scanning entirely.
    nitro({ serverDir: './server' }),
  ],
});
