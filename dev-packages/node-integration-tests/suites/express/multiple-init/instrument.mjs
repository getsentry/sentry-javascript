import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  // No dsn, means  client is disabled
  // dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

// We add http integration to ensure request isolation etc. works
const initialClient = Sentry.getClient();
initialClient?.addIntegration(Sentry.httpIntegration());
