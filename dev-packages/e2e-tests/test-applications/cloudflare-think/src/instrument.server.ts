import type { CloudflareOptions } from '@sentry/cloudflare';

export default (env: Env): CloudflareOptions => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
});
