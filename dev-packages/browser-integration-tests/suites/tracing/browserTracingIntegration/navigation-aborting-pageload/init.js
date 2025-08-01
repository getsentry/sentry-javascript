import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration({ idleTimeout: 2000, detectRedirects: false })],
  tracesSampleRate: 1,
});

// Navigate to a new page to abort the pageload
// We have to wait >300ms to avoid the redirect handling
setTimeout(() => {
  window.history.pushState({}, '', '/sub-page');
}, 500);
