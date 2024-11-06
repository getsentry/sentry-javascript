import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

window.fetchCallCount = 0;
window.spanEnded = false;

const originalWindowFetch = window.fetch;
window.fetch = (...args) => {
  window.fetchCallCount++;
  return originalWindowFetch(...args);
};

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  enabled: false,
});
