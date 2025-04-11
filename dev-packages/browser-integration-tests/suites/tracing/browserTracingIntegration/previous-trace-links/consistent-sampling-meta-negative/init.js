import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      linkPreviousTrace: 'in-memory',
      sampleLinkedTracesConsistently: true
    }),
  ],
  tracePropagationTargets: ['someurl.com'],
  tracesSampleRate: 1,
  debug: true,
  sendClientReports: true
});
