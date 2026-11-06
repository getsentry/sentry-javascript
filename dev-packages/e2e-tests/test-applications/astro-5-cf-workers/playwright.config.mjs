import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig({
  startCommand: process.env.PUBLIC_E2E_TEST_SERVER_CONFIG ? 'pnpm preview:server-config' : 'pnpm preview',
  port: 3030,
});

export default config;
