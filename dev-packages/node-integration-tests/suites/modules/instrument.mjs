import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  // Tracing is off, so `expressIntegration()` is not a default integration; opt in explicitly to
  // capture the thrown route error this test inspects.
  integrations: [Sentry.expressIntegration()],
});
