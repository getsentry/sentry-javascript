import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: window._testTraceLifecycle,
  dsn: 'https://public@o42.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ['http://sentry-test-site.example'],
  tracesSampleRate: 1,
  release: '1.0.0',
  environment: 'staging',
});
