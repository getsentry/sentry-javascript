import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server

  // Errors only: no `tracesSampleRate`, so Sentry starts no spans and sends no transactions.

  // The app brings its own OpenTelemetry SDK, which already owns the global tracer provider.
  // Errors are put on the active OpenTelemetry trace by `setupEventContextTrace`, which the SDK
  // installs regardless of this option.
  skipOpenTelemetrySetup: true,
});
