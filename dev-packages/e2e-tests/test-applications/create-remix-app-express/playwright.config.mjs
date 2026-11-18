import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: process.env.TEST_ENV === 'development' ? `pnpm dev` : `pnpm start`,
});

export default config;
