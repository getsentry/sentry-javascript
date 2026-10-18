import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  // We want to ignore redirects for this test
  integrations: [Sentry.browserTracingIntegration({ detectRedirects: false })],
  tracesSampler: ctx => {
    if (ctx.attributes['sentry.origin'] === 'auto.pageload.browser') {
      return 0;
    }
    return 1;
  },
});
