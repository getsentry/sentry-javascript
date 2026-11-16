import { defineCloudflareOptions } from '@sentry/cloudflare';
import { nestIntegration } from '@sentry/nestjs';

export default defineCloudflareOptions({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://username@domain/123',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
  // The cron job throws the same error on every run, which Dedupe would drop after the first run.
  integrations: integrations => [
    ...integrations.filter(integration => integration.name !== 'Dedupe'),
    nestIntegration(),
  ],
});
