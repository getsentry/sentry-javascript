import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  // The Context integration adds machine-specific attributes to segment spans, and adds the `os.*` ones only after an
  // async lookup. Without it, the tests can compare all span attributes.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Context'),
});
