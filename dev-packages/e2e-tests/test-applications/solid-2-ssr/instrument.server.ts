import { defineCloudflareOptions } from '@sentry/solid/solid2';

export default defineCloudflareOptions({
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  release: 'e2e-test',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});
