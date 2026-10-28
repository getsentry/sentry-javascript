import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  // in browser TwP means not setting tracesSampleRate but adding browserTracingIntegration,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ['http://sentry-test-site.example'],
  propagateTraceparent: true,
});
