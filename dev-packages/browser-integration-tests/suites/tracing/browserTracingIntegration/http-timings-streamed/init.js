import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 1000,
      _experiments: {
        enableHTTPTimings: true,
      },
    }),
    Sentry.spanStreamingIntegration(),
  ],
  tracesSampleRate: 1,
  traceLifecycle: 'stream',
  debug: true,
});
