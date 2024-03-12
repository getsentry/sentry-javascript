import * as Sentry from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  environment: 'production',
  tracesSampleRate: 1,
});

Sentry.setUser({ id: 'user123' });

Sentry.addEventProcessor(event => {
  event.transaction = 'testTransactionDSC';
  return event;
});

Sentry.getActiveSpan().setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
