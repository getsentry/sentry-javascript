import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
});

// Immediately navigate to a new page to abort the pageload
window.location.href = '#foo';
