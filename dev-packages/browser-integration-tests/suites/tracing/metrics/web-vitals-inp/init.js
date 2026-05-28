import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 5000,
      enableLongTask: false,
      enableInp: true,
      beforeStartSpan: options => ({ ...options, name: 'test-url' }),
    }),
    Sentry.spanStreamingIntegration(),
  ],
  traceLifecycle: 'stream',
  tracesSampleRate: 1,
  debug: true,
});
