// eslint-disable-next-line @typescript-eslint/no-unused-vars
import '@sentry/tracing';

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
});

const transaction = Sentry.startTransaction({ name: 'test_transaction_1' });

transaction.end();
