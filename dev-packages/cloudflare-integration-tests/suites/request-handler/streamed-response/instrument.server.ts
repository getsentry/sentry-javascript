import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  isStreamingResponse: response => (response.headers.get('content-type')?.startsWith('text/html') ? true : undefined),
}));
