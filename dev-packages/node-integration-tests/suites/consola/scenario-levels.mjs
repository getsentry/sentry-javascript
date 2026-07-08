import * as Sentry from '@sentry/node';
import { consola } from 'consola';

async function run() {
  // Set consola level to capture all logs including debug and trace
  consola.level = 5;

  // Create a Sentry reporter for consola
  const sentryReporter = Sentry.createConsolaReporter();

  // Add the reporter to consola
  consola.addReporter(sentryReporter);

  // Test level-based logging - test some basic level mappings by using different log methods
  consola.fatal('Fatal level message');
  consola.warn('Warning level message');
  consola.info('Info level message');

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
