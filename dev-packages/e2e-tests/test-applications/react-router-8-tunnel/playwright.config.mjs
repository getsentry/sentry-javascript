import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand:
    process.env.TEST_ENV === 'development'
      ? 'pnpm dev'
      : getRuntime() === 'cloudflare'
        ? 'pnpm start:cloudflare'
        : 'pnpm start',
});

export default {
  ...config,
  workers: process.env.CI ? 4 : config.workers,
};
