import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
});

Sentry.addEventProcessor(async () => {
  throw new Error('async event processor failed');
});

Sentry.captureException(new Error('this should get dropped because the async event processor rejects'));

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.flush();
