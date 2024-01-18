import * as Sentry from '@sentry/browser';
import { startSpanManual } from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Integrations.BrowserTracing()],
  tracesSampleRate: 1,
});

setTimeout(() => {
  startSpanManual({ name: 'pageload-child-span' }, () => {});
}, 200);
