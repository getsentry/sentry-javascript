import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

export default getPlaywrightConfig({
  startCommand:
    process.env.TEST_ENV === 'development'
      ? 'pnpm exec nuxt dev -p 3030'
      : getRuntime() === 'cloudflare'
        ? 'pnpm start:cloudflare'
        : 'pnpm start',
});
