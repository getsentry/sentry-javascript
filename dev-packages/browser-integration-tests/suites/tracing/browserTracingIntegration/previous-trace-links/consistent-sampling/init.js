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
  tracesSampler: ctx => {
    if (ctx.attributes && ctx.attributes['sentry.origin'] === 'auto.pageload.browser') {
      return 1;
    }
    return ctx.inheritOrSampleWith(0);
  },
  debug: true,
});
