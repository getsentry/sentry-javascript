import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration({ enableReportPageLoaded: true, finalTimeout: 3000 })],
  tracesSampleRate: 1,
  debug: true,
});

// not calling Sentry.reportPageLoaded() on purpose!
