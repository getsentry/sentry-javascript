import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      // To avoid having this test run for 15s
      childSpanTimeout: 4000,
    }),
  ],
  defaultIntegrations: false,
  tracesSampleRate: 1,
});

const activeSpan = Sentry.getActiveSpan();
if (activeSpan) {
  Sentry.startInactiveSpan({ name: 'pageload-child-span' });
} else {
  setTimeout(() => {
    Sentry.startInactiveSpan({ name: 'pageload-child-span' });
  }, 200);
}
