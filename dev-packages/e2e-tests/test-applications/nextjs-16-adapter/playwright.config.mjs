import { getPlaywrightConfig } from '@sentry-internal/test-utils';

if (process.env.TEST_ENV !== 'production') {
  throw new Error(`Unknown test env: ${process.env.TEST_ENV}`);
}

const config = getPlaywrightConfig({
  startCommand: 'pnpm start',
  port: 3030,
});

export default config;
