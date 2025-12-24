import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as cron from 'node-cron';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const cronWithCheckIn = Sentry.cron.instrumentNodeCron(cron, { isolateTrace: true });

let closeNext1 = false;
let closeNext2 = false;

const task = cronWithCheckIn.schedule(
  '* * * * * *',
  () => {
    if (closeNext1) {
      // https://github.com/node-cron/node-cron/issues/317
      setImmediate(() => {
        task.stop();
      });

      throw new Error('Error in cron job');
    }

    // eslint-disable-next-line no-console
    console.log('You will see this message every second');
    closeNext1 = true;
  },
  { name: 'my-cron-job' },
);

const task2 = cronWithCheckIn.schedule(
  '* * * * * *',
  () => {
    if (closeNext2) {
      // https://github.com/node-cron/node-cron/issues/317
      setImmediate(() => {
        task2.stop();
      });

      throw new Error('Error in cron job 2');
    }

    // eslint-disable-next-line no-console
    console.log('You will see this message every second');
    closeNext2 = true;
  },
  { name: 'my-2nd-cron-job' },
);

setTimeout(() => {
  process.exit();
}, 5000);
