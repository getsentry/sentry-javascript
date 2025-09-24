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
  // Set consola level to capture all logs including debug and trace
  consola.level = 5;

  // Create a Sentry reporter for consola
  const sentryReporter = Sentry.createConsolaReporter();

  // Add the reporter to consola
  consola.addReporter(sentryReporter);

  // Test with arguments formatting
  consola.info('Message with args:', 'hello', 123, { key: 'value' }, [1, 2, 3]);
  consola.log({
    type: 'debug',
    message: 'Debug message',
    userId: 12345,
    sessionId: 'abc-123-def',
    customData: { nested: 'value', count: 42 },
  });

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
