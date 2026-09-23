import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.browserTracingIntegration({ instrumentNavigation: false, instrumentPageLoad: false }),
    Sentry.featureFlagsIntegration(),
  ],
});
