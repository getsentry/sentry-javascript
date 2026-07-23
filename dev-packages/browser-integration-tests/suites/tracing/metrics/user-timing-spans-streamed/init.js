import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.userTimingSpansIntegration(),
    Sentry.spanStreamingIntegration(),
  ],
  traceLifecycle: 'stream',
  tracesSampleRate: 1,
});

performance.mark('app-ready');
performance.measure('app-initialization');
