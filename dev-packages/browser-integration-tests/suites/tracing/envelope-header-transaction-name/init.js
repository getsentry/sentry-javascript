import * as Sentry from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Sentry.BrowserTracing({ tracingOrigins: [/.*/] })],
  environment: 'production',
  tracesSampleRate: 1,
  debug: true,
});

const scope = Sentry.getCurrentScope();
scope.setUser({ id: 'user123' });
scope.addEventProcessor(event => {
  event.transaction = 'testTransactionDSC';
  return event;
});
scope.getTransaction().setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
