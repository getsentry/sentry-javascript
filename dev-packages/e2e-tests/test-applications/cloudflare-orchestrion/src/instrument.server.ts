import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: Env) => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
  transportOptions: {
    bufferSize: 1000,
  },
}));
