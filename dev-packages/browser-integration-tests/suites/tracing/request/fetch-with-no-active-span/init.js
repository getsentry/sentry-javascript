import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  // disable pageload transaction
  integrations: [Sentry.BrowserTracing({ tracingOrigins: ['http://example.com'], startTransactionOnPageLoad: false })],
  tracesSampleRate: 1,
});
