import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({ enableLongTask: false, enableLongAnimationFrame: false, idleTimeout: 2000 }),
    Sentry.spanStreamingIntegration(),
  ],
  tracesSampleRate: 1,
});
