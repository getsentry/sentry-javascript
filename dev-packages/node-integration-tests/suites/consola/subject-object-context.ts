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

  // Object context extraction - objects should become searchable attributes
  consola.info('User logged in', { userId: 123, sessionId: 'abc-123' });

  // Multiple objects - properties should be merged
  consola.warn('Payment processed', { orderId: 456 }, { amount: 99.99, currency: 'USD' });

  // Mixed primitives and objects
  consola.error('Error occurred', 'in payment module', { errorCode: 'E001', retryable: true });

  // Aarrays (should be stored as context attributes)
  consola.debug('Processing items', [1, 2, 3, 4, 5]);

  // Nested objects
  consola.info('Complex data', { user: { id: 789, name: 'Jane' }, metadata: { source: 'api' } });

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
