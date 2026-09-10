import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // A release makes the process session sendable, so the session is sent on `beforeExit`.
  release: '1.0.0',
  // Without the SDK's own OpenTelemetry setup there is no context manager, so the `suppressTracing()`
  // wrapper around transport requests has nowhere to store the suppression.
  skipOpenTelemetrySetup: true,
});
