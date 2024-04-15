import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ['http://example.com'],
  // no tracesSampleRate defined means TWP mode
});
