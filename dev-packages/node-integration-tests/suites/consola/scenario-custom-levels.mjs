import * as Sentry from '@sentry/node';
import { consola } from 'consola';

async function run() {
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
