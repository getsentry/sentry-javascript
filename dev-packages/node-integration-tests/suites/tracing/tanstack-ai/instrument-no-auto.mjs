import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Without the integration nothing injects the middleware, so only an explicit one records spans.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: integrations => integrations.filter(integration => integration.name !== 'TanStackAI'),
});
