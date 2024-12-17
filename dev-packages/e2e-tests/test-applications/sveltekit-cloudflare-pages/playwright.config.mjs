import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'pnpm wrangler pages dev --port 3030 .svelte-kit/cloudflare',
  port: 3030,
});

export default config;
