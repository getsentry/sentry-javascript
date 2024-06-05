import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 1000,
      enableLongTask: false,
      enableInp: true,
    }),
  ],
  tracesSampleRate: 1,
});

const client = Sentry.getClient();

if (client) {
  // Force page load transaction name to a testable value
  Sentry.startBrowserTracingPageLoadSpan(client, {
    name: 'test-route',
  });
}
