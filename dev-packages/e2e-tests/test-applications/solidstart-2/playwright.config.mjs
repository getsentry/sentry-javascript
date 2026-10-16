import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: process.env.TEST_ENV === 'development' ? 'pnpm exec vite dev --port 3030' : 'pnpm start',
  port: 3030,
});

export default config;
