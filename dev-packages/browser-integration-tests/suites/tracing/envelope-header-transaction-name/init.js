import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
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

Sentry.getActiveSpan().setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'custom');
