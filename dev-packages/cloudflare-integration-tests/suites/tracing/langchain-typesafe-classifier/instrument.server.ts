import { defineCloudflareOptions } from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default defineCloudflareOptions((env: Env) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  dataCollection: { genAI: { inputs: true, outputs: true } },
}));
