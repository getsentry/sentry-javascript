import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      enableLongAnimationFrame: false,
    }),
  ],
  tracesSampleRate: 1,
});
