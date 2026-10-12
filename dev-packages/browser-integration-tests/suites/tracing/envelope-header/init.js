import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: [/.*/],
  environment: 'production',
  tracesSampleRate: 1,
});

const scope = Sentry.getCurrentScope();
scope.setUser({ id: 'user123' });
scope.addEventProcessor(event => {
  event.transaction = 'testTransactionDSC';
  return event;
});
