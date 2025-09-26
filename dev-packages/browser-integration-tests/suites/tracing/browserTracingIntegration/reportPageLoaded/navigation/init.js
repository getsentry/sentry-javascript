import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration({ enableReportPageLoaded: true, instrumentNavigation: false })],
  tracesSampleRate: 1,
  debug: true,
});

setTimeout(() => {
  Sentry.startBrowserTracingNavigationSpan(Sentry.getClient(), { name: 'custom_navigation' });
}, 1000);

setTimeout(() => {
  Sentry.reportPageLoaded();
}, 2500);
