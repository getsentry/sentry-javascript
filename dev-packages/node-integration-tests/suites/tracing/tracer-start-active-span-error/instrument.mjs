import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  // This suite drives the raw OpenTelemetry tracer (`client.tracer.startActiveSpan`), which only
  // produces spans when Sentry owns the tracer provider.
  enableOpenTelemetrySetup: true,
});
