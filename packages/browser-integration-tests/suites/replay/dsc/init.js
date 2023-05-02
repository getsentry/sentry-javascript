import * as Sentry from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

window.Sentry = Sentry;
window.Replay = new Sentry.Replay({
  flushMinDelay: 200,
  flushMaxDelay: 200,
  useCompression: false,
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Integrations.BrowserTracing({ tracingOrigins: [/.*/] }), window.Replay],
  environment: 'production',
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,
});
