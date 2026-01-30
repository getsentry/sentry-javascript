import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.spanStreamingIntegration(),
  ],
  tracesSampleRate: 1,
  debug: true,
});
