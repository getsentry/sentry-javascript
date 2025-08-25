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
  // Test custom levels filtering
  const customReporter = Sentry.createConsolaReporter({
    levels: ['error', 'warn'], // Only capture errors and warnings
  });

  // Add the custom reporter to consola
  consola.addReporter(customReporter);

  consola.info('This should not be captured');
  consola.warn('This should be captured');
  consola.error('This should also be captured');

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
