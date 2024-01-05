import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '0.1',
  // intentionally disabling this, we want to leverage the deprecated hub API
  autoSessionTracking: false,
});

// simulate old startSessionTracking behavior
Sentry.getCurrentHub().startSession({ ignoreDuration: true });
Sentry.getCurrentHub().captureSession();
