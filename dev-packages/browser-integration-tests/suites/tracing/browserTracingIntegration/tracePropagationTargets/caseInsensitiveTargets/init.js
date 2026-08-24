import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ['sentry-test-Site.example/String', /^http:\/\/sentry-test-site\.EXAMPLE\/regex/],
  tracesSampleRate: 1,
});
