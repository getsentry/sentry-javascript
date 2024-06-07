import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 1000,
      enableLongTask: false,
      enableInp: true,
      instrumentPageLoad: false,
      instrumentNavigation: false,
    }),
  ],
  tracesSampleRate: 1,
});

const client = Sentry.getClient();

// Force page load transaction name to a testable value
Sentry.startBrowserTracingPageLoadSpan(client, {
  name: 'test-url',
  attributes: {
    [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
  },
});
