import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig({
  startCommand: testEnv === 'development' ? 'pnpm dev --port 3030' : 'pnpm start',
});

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
