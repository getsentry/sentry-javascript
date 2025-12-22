import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { consola } from 'consola';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  enableLogs: true,
  transport: loggingTransport,
});

async function run(): Promise<void> {
  consola.level = 5;

  const sentryReporter = Sentry.createConsolaReporter();
  consola.addReporter(sentryReporter);

  // Test Date objects are preserved
  consola.info('Current time:', new Date('2023-01-01T00:00:00.000Z'));

  // Test Error objects are preserved
  consola.error('Error occurred:', new Error('Test error'));

  // Test RegExp objects are preserved
  consola.info('Pattern:', /test/gi);

  // Test Map and Set objects are preserved
  consola.info('Collections:', new Map([['key', 'value']]), new Set([1, 2, 3]));

  // Test mixed: plain object + special object
  consola.info('Mixed data', { userId: 123 }, new Date('2023-06-15T12:00:00.000Z'));

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();

