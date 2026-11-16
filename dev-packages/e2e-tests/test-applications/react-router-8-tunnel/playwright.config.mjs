import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

export default getPlaywrightConfig({
  startCommand:
    process.env.TEST_ENV === 'development'
      ? 'pnpm dev'
      : getRuntime() === 'cloudflare'
        ? 'pnpm start:cloudflare'
        : 'pnpm start',
});
