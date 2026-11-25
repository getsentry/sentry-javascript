import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const prodStartCommand =
  process.env.RUNTIME === 'cloudflare' ? 'pnpm exec wrangler dev --port 3030' : 'PORT=3030 node build';

const config = getPlaywrightConfig({
  startCommand: process.env.TEST_ENV === 'development' ? 'pnpm exec vite dev --port 3030' : prodStartCommand,
});

export default {
  ...config,
  workers: process.env.CI ? 4 : config.workers,
};
