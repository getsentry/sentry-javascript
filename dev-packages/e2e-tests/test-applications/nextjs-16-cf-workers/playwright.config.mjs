import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const getStartCommand = () => {
  if (testEnv === 'production') {
    // --ip: CI Playwright container; fetch uses 127.0.0.1 while default bind can be ::1-only.
    return 'pnpm cf:preview --ip 0.0.0.0 --port 3030';
  }

  throw new Error(`Unknown test env: ${testEnv}`);
};

const config = getPlaywrightConfig({
  startCommand: getStartCommand(),
  port: 3030,
});

export default config;
