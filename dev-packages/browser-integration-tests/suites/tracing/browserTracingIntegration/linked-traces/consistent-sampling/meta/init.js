import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      linkPreviousTrace: 'in-memory',
      consistentTraceSampling: true,
    }),
  ],
  tracePropagationTargets: ['sentry-test-external.io'],
  // only take into account sampling from meta tag; otherwise sample negatively
  tracesSampleRate: 0,
  debug: true,
});
