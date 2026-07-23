import { SENTRY_OP } from '@sentry/conventions/attributes';
import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), Sentry.spanStreamingIntegration()],
  ignoreSpans: [{ attributes: { [SENTRY_OP]: 'http.client' } }],
  tracePropagationTargets: ['sentry-test-external.io'],
  tracesSampleRate: 0,
});
