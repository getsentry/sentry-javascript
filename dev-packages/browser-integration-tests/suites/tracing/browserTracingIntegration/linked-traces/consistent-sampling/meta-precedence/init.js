import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      linkPreviousTrace: 'session-storage',
      consistentTraceSampling: true,
    }),
  ],
  tracePropagationTargets: ['sentry-test-external.io'],
  tracesSampler: ({ inheritOrSampleWith }) => {
    return inheritOrSampleWith(0);
  },
  debug: true,
  sendClientReports: true,
});
