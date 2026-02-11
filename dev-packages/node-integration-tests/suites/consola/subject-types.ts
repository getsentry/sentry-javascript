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
  // Set consola level to capture all logs including debug, trace, and verbose
  consola.level = Number.POSITIVE_INFINITY;

  // Create a Sentry reporter for consola
  const sentryReporter = Sentry.createConsolaReporter();

  // Add the reporter to consola
  consola.addReporter(sentryReporter);

  // Test basic logging with different types
  consola.info('Test info message');
  consola.error('Test error message');
  consola.warn('Test warn message');

  // Test different consola log types
  consola.success('Test success message');
  consola.fail('Test fail message');
  consola.ready('Test ready message');
  consola.start('Test start message');
  consola.box('Test box message');
  consola.verbose('Test verbose message');
  consola.debug('Test debug message');
  consola.trace('Test trace message');

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
