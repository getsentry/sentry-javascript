import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window._testBaseTimestamp = performance.timeOrigin / 1000;

setTimeout(() => {
  window._testTimeoutTimestamp = (performance.timeOrigin + performance.now()) / 1000;
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1,
  });
}, 250);
