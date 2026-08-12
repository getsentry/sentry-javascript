import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  beforeSendTransaction: transactionEvent => {
    const op = transactionEvent.contexts.trace.op;
    if (op === 'pageload' || op === 'navigation') {
      // use whatever logic you want to set the name
      transactionEvent.transaction = 'customName';

      transactionEvent.transaction_info.source = 'route';
      transactionEvent.contexts.trace.data = {
        ...transactionEvent.contexts.trace.data,
        'sentry.segment.name.source': 'route',
      };
    }
    return transactionEvent;
  },
  tracesSampleRate: 1,
});
