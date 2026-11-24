import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  sampleRate: 0,
  integrations: [
    Sentry.httpIntegration({
      // Flush after 2 seconds (to avoid waiting for the default 60s)
      sessionFlushingDelayMS: 2_000,
    }),
    Sentry.expressIntegration(),
  ],
});
