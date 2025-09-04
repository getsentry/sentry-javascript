import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  // We deliberately disable dedupe here, to make sure we do not double wrap the emit function
  // Otherwise, duplicate spans (that we want to test against) may be dropped by dedupe detection
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
