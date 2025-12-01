import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  traceLifecycle: 'stream',
  integrations: [Sentry.browserTracingIntegration(), Sentry.spanStreamingIntegration()],
  tracePropagationTargets: ['http://sentry-test-site.example'],
  tracesSampleRate: 1,
  sendDefaultPii: true,
  debug: true,
});
