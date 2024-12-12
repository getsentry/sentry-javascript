import { sentryRollupPlugin } from '@sentry/rollup-plugin';
import { defineConfig } from 'rollup';

export default defineConfig({
  input: './src/app.js',
  external: ['@sentry/node'],
  plugins: [
    sentryRollupPlugin({
      org: process.env.E2E_TEST_SENTRY_ORG_SLUG,
      project: process.env.E2E_TEST_SENTRY_PROJECT,
      authToken: process.env.E2E_TEST_AUTH_TOKEN,
    }),
  ],
  output: {
    file: './dist/app.js',
    compact: true,
    format: 'cjs',
    sourcemap: 'hidden',
  },
});
