import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});

for (let i = 0; i < 2; i++) {
  Sentry.captureException(new Error('duplicate error'));
}
