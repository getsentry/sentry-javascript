import { defineCloudflareOptions } from '@sentry/cloudflare';

declare const __E2E_TEST_TUNNEL__: boolean;

export default defineCloudflareOptions({
  dsn: __E2E_TEST_TUNNEL__ ? 'http://public@localhost:3031/1337' : 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: __E2E_TEST_TUNNEL__ ? true : 'http://localhost:3031/', // proxy server
});
