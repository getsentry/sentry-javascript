import * as Sentry from '@sentry/nuxt';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  tunnel: 'http://localhost:3031/', // proxy server
  // Opt into the Sentry OpenTelemetry tracer provider in the "(tracer provider)" e2e variant.
  // Leaving it `undefined` otherwise keeps the SDK's default (no provider).
  skipOpenTelemetrySetup: process.env.E2E_TEST_OTEL_SETUP === 'true' ? false : undefined,
});
