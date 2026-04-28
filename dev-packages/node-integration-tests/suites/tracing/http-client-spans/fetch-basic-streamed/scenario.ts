import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  traceLifecycle: 'stream',
  transport: loggingTransport,
});

async function run(): Promise<void> {
  await Sentry.startSpan({ name: 'test_transaction' }, async () => {
    await fetch(`${process.env.SERVER_URL}/api/v0`);
  });

  await Sentry.flush();
}

void run();
