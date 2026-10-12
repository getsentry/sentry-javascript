import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  serverName: 'mi-servidor.com',
  transport: loggingTransport,
});

async function run(): Promise<void> {
  Sentry.metrics.count('test.counter', 1, { attributes: { endpoint: '/api/test' } });

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
