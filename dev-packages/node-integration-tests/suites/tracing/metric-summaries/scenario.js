const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node-experimental');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

Sentry.startSpan(
  {
    name: 'Test Transaction',
    op: 'transaction',
  },
  () => {
    Sentry.metrics.increment('root-counter', 1, {
      tags: {
        email: 'jon.doe@example.com',
      },
    });
    Sentry.metrics.increment('root-counter', 1, {
      tags: {
        email: 'jane.doe@example.com',
      },
    });

    Sentry.startSpan(
      {
        name: 'Some other span',
        op: 'transaction',
      },
      () => {
        Sentry.metrics.increment('root-counter');
        Sentry.metrics.increment('root-counter');
        Sentry.metrics.increment('root-counter', 2);

        Sentry.metrics.set('root-set', 'some-value');
        Sentry.metrics.set('root-set', 'another-value');
        Sentry.metrics.set('root-set', 'another-value');

        Sentry.metrics.gauge('root-gauge', 42);
        Sentry.metrics.gauge('root-gauge', 20);

        Sentry.metrics.distribution('root-distribution', 42);
        Sentry.metrics.distribution('root-distribution', 20);
      },
    );
  },
);
