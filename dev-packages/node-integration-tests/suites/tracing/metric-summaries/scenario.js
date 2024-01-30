const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  _experiments: {
    metricsAggregator: true,
  },
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

Sentry.startSpan(
  {
    name: 'Test Transaction',
    op: 'transaction',
  },
  () => {
    Sentry.startSpan(
      {
        name: 'Some other span',
        op: 'transaction',
      },
      () => {
        Sentry.metrics.increment('root-counter');
        Sentry.metrics.increment('root-counter');
        Sentry.metrics.increment('root-counter', 2);
      },
    );
  },
);
