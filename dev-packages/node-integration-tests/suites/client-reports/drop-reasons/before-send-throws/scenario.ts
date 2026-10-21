import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  beforeSend() {
    throw new Error('beforeSend failed');
  },
});

Sentry.captureException(new Error('this should get dropped because beforeSend throws'));

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.flush();
