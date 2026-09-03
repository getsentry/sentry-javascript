import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  debug: true,
  // With tracing off, `expressIntegration()` is not a default integration, so opt in explicitly to
  // get automatic error capture.
  integrations: [Sentry.expressIntegration()],
});
