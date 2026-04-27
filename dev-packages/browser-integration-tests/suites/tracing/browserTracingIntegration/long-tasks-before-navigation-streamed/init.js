import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.webVitalsIntegration({ disable: ['inp'] }),
    Sentry.browserTracingIntegration({
      enableLongAnimationFrame: false,
      instrumentPageLoad: false,
      instrumentNavigation: true,
      enableLongTask: true,
    }),
    Sentry.spanStreamingIntegration(),
  ],
  tracesSampleRate: 1,
});
