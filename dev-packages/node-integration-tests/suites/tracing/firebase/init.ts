import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

// Optional and only needed to see the internal diagnostic logging (during development)
// import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.firebaseIntegration()],
  defaultIntegrations: false,
});
