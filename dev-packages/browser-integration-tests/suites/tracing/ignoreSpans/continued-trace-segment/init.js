import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  ignoreSpans: [{ op: 'pageload' }],
  tracePropagationTargets: ['sentry-test-external.io'],
  tracesSampleRate: 0,
});
