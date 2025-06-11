import * as Sentry from '@sentry/browser';

// Create a simple measure with detail before SDK init
performance.measure('test-measure', {
  duration: 100,
  detail: { foo: 'bar' },
});

window.Sentry = Sentry;
window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
});
