import node from '@astrojs/node';
import sentry from '@sentry/astro';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  integrations: [
    sentry({
      debug: true,
      sourceMapsUploadOptions: {
        enabled: false,
      },
    }),
  ],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    // Run the orchestrion code transform on the Vite SSR bundle so instrumented
    // DB drivers (mysql, ioredis) get `diagnostics_channel` publishers injected
    // at build time.
    plugins: [sentryOrchestrionPlugin()],
  },
});
