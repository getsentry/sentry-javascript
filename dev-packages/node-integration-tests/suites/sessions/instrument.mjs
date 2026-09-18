import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  integrations: [
    Sentry.httpIntegration({
      // Flush after 2 seconds (to avoid waiting for the default 60s)
      sessionFlushingDelayMS: 2_000,
    }),
    // Tracing is off, so `expressIntegration()` is not a default integration; opt in explicitly so
    // unhandled route errors are captured and their request sessions are marked as crashed.
    Sentry.expressIntegration(),
  ],
});
