import * as Sentry from '@sentry/node';
import { consola } from 'consola';

async function run() {
  consola.level = 5;
  const sentryReporter = Sentry.createConsolaReporter();
  consola.addReporter(sentryReporter);

  // Object-first: args = [object, string] — first object becomes attributes, second arg is part of formatted message
  consola.info({ userId: 100, action: 'login' }, 'User logged in');

  // Object-first: args = [object] only — object keys become attributes, message is stringified object
  consola.info({ event: 'click', count: 2 });

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
