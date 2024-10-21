import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig(
  {
    startCommand: testEnv === 'development' ? 'pnpm next dev -p 3030 --turbo' : 'pnpm next start -p 3030',
    port: 3030,
  },
  {
    // This comes with the risk of tests leaking into each other but the tests run quite slow so we should parallelize
    workers: '100%',
  },
);

export default config;
