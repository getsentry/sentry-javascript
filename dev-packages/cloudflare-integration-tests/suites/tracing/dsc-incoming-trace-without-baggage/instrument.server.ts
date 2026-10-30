import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: { SENTRY_DSN: string; SERVER_URL: string }) => ({
  dsn: env.SENTRY_DSN,
  release: '1.0.0',
  tracesSampleRate: 0.5,
  tracePropagationTargets: [env.SERVER_URL],
}));
