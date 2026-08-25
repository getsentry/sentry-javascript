import * as Sentry from '@sentry/nestjs';

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
  // Opt into the Sentry OpenTelemetry tracer provider in the "(tracer provider)" e2e variant.
  // Leaving it `undefined` otherwise keeps the SDK's default (no provider).
  enableOpenTelemetrySetup: process.env.E2E_TEST_OTEL_SETUP === 'true' ? true : undefined,
});
