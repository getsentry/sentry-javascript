import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), Sentry.spanStreamingIntegration()],
  ignoreSpans: [{ attributes: { 'sentry.op': 'http.client' } }],
  tracePropagationTargets: ['sentry-test-external.io'],
  tracesSampleRate: 0,
});
