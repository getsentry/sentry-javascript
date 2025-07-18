import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const getStartCommand = () => {
  if (testEnv === 'dev-turbopack') {
    return 'pnpm next dev -p 3030 --turbopack';
  }

  if (testEnv === 'development') {
    return 'pnpm next dev -p 3030';
  }

  if (testEnv === 'production') {
    return 'pnpm next start -p 3030';
  }

  throw new Error(`Unknown test env: ${testEnv}`);
};

const config = getPlaywrightConfig({
  startCommand: getStartCommand(),
  port: 3030,
});

export default config;
