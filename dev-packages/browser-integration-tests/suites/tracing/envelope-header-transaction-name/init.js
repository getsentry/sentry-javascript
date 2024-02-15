import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Sentry.BrowserTracing()],
  environment: 'production',
  tracesSampleRate: 1,
  debug: true,
});

Sentry.setUser({ id: 'user123' });

Sentry.addEventProcessor(event => {
  event.transaction = 'testTransactionDSC';
  return event;
});

const scope = Sentry.getCurrentScope();
scope.getTransaction().setMetadata({ source: 'custom' });
scope.getTransaction().setAttributes({ [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' });
