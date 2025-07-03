import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      linkPreviousTrace: 'in-memory',
      consistentTraceSampling: true,
      enableInp: false,
    }),
  ],
  tracePropagationTargets: ['sentry-test-external.io'],
  tracesSampler: ctx => {
    if (ctx.attributes && ctx.attributes['sentry.origin'] === 'auto.pageload.browser') {
      return 1;
    }
    if (ctx.name === 'custom root span 1') {
      return 0;
    }
    if (ctx.name === 'custom root span 2') {
      return 1;
    }
    return ctx.inheritOrSampleWith(0);
  },
  debug: true,
});
