import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: 'hidden',
    envPrefix: ['PUBLIC_'],
  },

  plugins: [
    sentryVitePlugin({
      org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
      project: process.env.E2E_TEST_SENTRY_PROJECT,
      authToken: process.env.E2E_TEST_AUTH_TOKEN,
      applicationKey: 'browser-webworker-vite',
    }),
  ],

  worker: {
    plugins: () => [
      ...sentryVitePlugin({
        org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
        project: process.env.E2E_TEST_SENTRY_PROJECT,
        authToken: process.env.E2E_TEST_AUTH_TOKEN,
        applicationKey: 'browser-webworker-vite',
      }),
    ],
  },

  envPrefix: ['PUBLIC_'],
});
