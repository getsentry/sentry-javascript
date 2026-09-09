import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // A release makes the process session sendable, so the session is sent on `beforeExit`.
  release: '1.0.0',
  // Without the SDK's own OpenTelemetry setup there is no context manager, so the `suppressTracing()`
  // wrapper around transport requests has nowhere to store the suppression.
  skipOpenTelemetrySetup: true,
});

// The timer is unref'd so it never keeps the process alive by itself: it only fires if something
// else does. That makes an exit-time flush loop show up as this marker instead of as a test timeout.
setTimeout(() => {
  // eslint-disable-next-line no-console
  console.log("I'm alive!");
  process.exit(0);
}, 3000).unref();
