import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const APP_PORT = 38788;

const config = getPlaywrightConfig({
  startCommand: `pnpm dev --port ${APP_PORT}`,
  port: APP_PORT,
});

export default config;
