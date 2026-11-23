import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as cron from 'node-cron';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const cronWithCheckIn = Sentry.cron.instrumentNodeCron(cron);

let closeNext = false;

const task = cronWithCheckIn.schedule(
  '0 9 * * 1-5',
  () => {
    if (closeNext) {
      throw new Error('Error in cron job');
    }

    closeNext = true;
  },
  { name: 'my-cron-job', timezone: 'Europe/Vienna' },
);

// Run the task without waiting for its schedule.
task.stop();
task
  .execute()
  .then(() => task.execute())
  .catch(() => {});

setTimeout(() => {
  process.exit();
}, 10_000);
