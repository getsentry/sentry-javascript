import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig({
  startCommand: testEnv === 'development' ? 'pnpm next dev -p 3030' : 'pnpm next start -p 3030',
  url: 'http://localhost:3030',
});

export default {
  ...config,
  workers: process.env.CI ? 2 : config.workers,
  retries: process.env.CI ? 0 : config.retries,
};
