import * as Sentry from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Integrations.BrowserTracing({ tracePropagationTargets: ['http://example.com'] })],
  tracesSampleRate: 1,
});
