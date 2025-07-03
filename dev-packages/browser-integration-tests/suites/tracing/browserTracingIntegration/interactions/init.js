import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 1000,
      enableLongTask: false,
      _experiments: {
        enableInteractions: true,
      },
    }),
  ],
  tracesSampleRate: 1,
});
