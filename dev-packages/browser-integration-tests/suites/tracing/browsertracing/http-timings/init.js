import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    new Sentry.BrowserTracing({
      idleTimeout: 1000,
      _experiments: {
        enableHTTPTimings: true,
      },
    }),
  ],
  tracesSampleRate: 1,
});
