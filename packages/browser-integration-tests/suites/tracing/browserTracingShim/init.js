import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1,
  integrations: [new Sentry.BrowserTracing()],
});

// This should not fail
Sentry.addTracingExtensions();
