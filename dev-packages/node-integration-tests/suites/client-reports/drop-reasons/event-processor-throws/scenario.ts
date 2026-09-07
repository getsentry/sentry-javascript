import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
});

Sentry.addEventProcessor(() => {
  throw new Error('event processor failed');
});

Sentry.captureException(new Error('this should get dropped because the event processor throws'));

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.flush();
