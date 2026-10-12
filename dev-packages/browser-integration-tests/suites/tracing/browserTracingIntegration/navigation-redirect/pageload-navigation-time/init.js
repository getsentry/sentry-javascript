import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
});

// trigger redirect later
setTimeout(() => {
  window.history.pushState({}, '', '/sub-page');
}, 1550);
