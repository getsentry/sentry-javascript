import * as Sentry from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    new Integrations.BrowserTracing({
      idleTimeout: 1000,
      _experiments: {
        interactionSampleRate: 1.0,
      },
    }),
  ],
  tracesSampleRate: 1,
});
