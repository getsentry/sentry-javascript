import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://username@domain/123',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
});
