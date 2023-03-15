import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Sentry.BrowserTracing({ tracingOrigins: [/.*/] })],
  environment: 'production',
  tracesSampleRate: 1,
  debug: true,
});

Sentry.configureScope(scope => {
  scope.setUser({ id: 'user123', segment: 'segmentB' });
  scope.setTransactionName('testTransactionDSC');
  scope.getTransaction().setMetadata({ source: 'custom' });
});
