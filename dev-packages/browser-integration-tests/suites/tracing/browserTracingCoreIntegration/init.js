import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingCoreIntegration(), Sentry.fetchTracingIntegration()],
  tracePropagationTargets: ['http://sentry-test-site.example'],
  tracesSampleRate: 1,
});
