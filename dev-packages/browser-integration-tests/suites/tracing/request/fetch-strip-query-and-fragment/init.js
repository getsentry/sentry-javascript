import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false })],
  tracePropagationTargets: ['http://sentry-test-site.example'],
  tracesSampleRate: 1,
  autoSessionTracking: false,
});
