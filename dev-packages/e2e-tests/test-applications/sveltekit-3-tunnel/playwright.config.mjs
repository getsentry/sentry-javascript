import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const prodStartCommand =
  process.env.RUNTIME === 'cloudflare' ? 'pnpm exec wrangler dev --port 3030' : 'PORT=3030 node build';

export default getPlaywrightConfig({
  startCommand: process.env.TEST_ENV === 'development' ? 'pnpm exec vite dev --port 3030' : prodStartCommand,
});
