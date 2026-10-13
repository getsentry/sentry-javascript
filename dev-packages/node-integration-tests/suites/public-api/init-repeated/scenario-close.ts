import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

async function run(): Promise<void> {
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '1.0',
    transport: loggingTransport,
  });

  await Sentry.close();

  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '2.0',
    transport: loggingTransport,
  });

  Sentry.captureMessage('after close and init');
}

run();
