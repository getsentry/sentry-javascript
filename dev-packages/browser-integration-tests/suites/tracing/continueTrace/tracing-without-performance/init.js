import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

// In the browser, "tracing without performance" (TwP) means enabling `browserTracingIntegration`
// but not setting `tracesSampleRate`.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ['http://sentry-test-site.example'],
});
