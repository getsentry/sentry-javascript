import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: { SENTRY_DSN: string; TRACES_SAMPLE_RATE: string }) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: Number(env.TRACES_SAMPLE_RATE),
}));
