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
Sentry.startInactiveSpan({
  name: 'pageload-child-span',
  onlyIfParent: true,
  // Set this to ensure we do not discard this span due to timeout
  startTime: activeSpan && Sentry.spanToJSON(activeSpan).start_timestamp,
});
