import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  debug: true,
});

// Simulate a user who independently sets up OTel HttpInstrumentation
// alongside the Sentry SDK, as when adopting Sentry into existing OTel app
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

registerInstrumentations({
  instrumentations: [new HttpInstrumentation()],
});
