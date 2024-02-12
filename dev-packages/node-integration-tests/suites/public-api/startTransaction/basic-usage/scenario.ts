import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
});

// eslint-disable-next-line deprecation/deprecation
const transaction = Sentry.startTransaction({ name: 'test_transaction_1' });

transaction.end();
