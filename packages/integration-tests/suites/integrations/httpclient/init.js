import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Sentry.Integrations.HttpClient()],
  tracesSampleRate: 1,
  sendDefaultPii: true,
});
