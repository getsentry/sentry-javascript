import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration({ instrumentNavigation: false, instrumentPageLoad: false })],
  tracesSampleRate: 1,
  tracePropagationTargets: ['sentry-test-site.example'],
  release: '1.1.1',
});
