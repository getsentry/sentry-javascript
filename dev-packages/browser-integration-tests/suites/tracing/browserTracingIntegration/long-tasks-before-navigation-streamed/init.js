import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      enableLongAnimationFrame: false,
      instrumentPageLoad: false,
      instrumentNavigation: true,
      webVitals: { ignore: ['inp'] },
      enableLongTask: true,
    }),
    Sentry.spanStreamingIntegration(),
  ],
  tracesSampleRate: 1,
});
