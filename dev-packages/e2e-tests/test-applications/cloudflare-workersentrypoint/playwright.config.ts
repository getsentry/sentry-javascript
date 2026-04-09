import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const APP_PORT = 38787;

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm dev --port ${APP_PORT}`,
    port: APP_PORT,
  },
  {
    // This comes with the risk of tests leaking into each other but the tests run quite slow so we should parallelize
    workers: '100%',
    retries: 0,
  },
);

export default config;
