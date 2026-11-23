import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: process.env.TEST_ENV === 'development' ? 'pnpm dev' : 'pnpm preview --port 3030',
  port: 3030,
});

export default config;
