import { defineCloudflareOptions } from '@sentry/cloudflare';
import { lowQualityTransactionsFilterIntegration } from '@sentry/react-router/cloudflare';

export default defineCloudflareOptions({
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
  integrations: [lowQualityTransactionsFilterIntegration()],
});
