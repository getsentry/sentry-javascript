import * as Sentry from '@sentry/browser';
import { startSpanManual } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      // To avoid having this test run for 15s
      childSpanTimeout: 5000,
    }),
  ],
  defaultIntegrations: false,
  tracesSampleRate: 1,
});

setTimeout(() => {
  startSpanManual({ name: 'pageload-child-span' }, () => {});
}, 200);
