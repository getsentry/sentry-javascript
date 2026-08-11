import { sentryCloudflareNitroPlugin } from '@sentry/nitro/cloudflare';
import { definePlugin } from 'nitro';

export default definePlugin(
  sentryCloudflareNitroPlugin(() => ({
    environment: 'qa',
    traceLifecycle: 'static',
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
  })),
);
