import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      enableLongTask: false,
      _experiments: {
        enableInteractions: true,
      },
    }),
    Sentry.spanStreamingIntegration(),
    Sentry.spotlightBrowserIntegration(),
  ],
  tracesSampleRate: 1,
});
