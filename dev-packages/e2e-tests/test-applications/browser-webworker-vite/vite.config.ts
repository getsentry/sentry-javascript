import { sentryVitePlugin } from '@sentry/vite-plugin';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },

  plugins: [
    sentryVitePlugin({
      org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
      project: process.env.E2E_TEST_SENTRY_PROJECT,
      authToken: process.env.E2E_TEST_AUTH_TOKEN,
    }),
  ],

  worker: {
    plugins: () => [
      ...sentryVitePlugin({
        org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
        project: process.env.E2E_TEST_SENTRY_PROJECT,
        authToken: process.env.E2E_TEST_AUTH_TOKEN,
      }),
    ],
  },
});
