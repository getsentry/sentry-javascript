import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig({
  startCommand: testEnv === 'development' ? 'pnpm dev' : 'pnpm start',
});

export default config;
