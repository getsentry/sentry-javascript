import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
});

const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, 'my-cron-job');

let closeNext = false;

const cron = new CronJobWithCheckIn(
  '0 9 * * 1-5',
  () => {
    if (closeNext) {
      throw new Error('Error in cron job');
    }

    closeNext = true;
  },
  undefined,
  false,
  'Europe/Vienna',
);

// Run the job without waiting for its schedule.
(async () => {
  await cron.fireOnTick();
  await cron.fireOnTick();
})();

setTimeout(() => {
  process.exit();
}, 10_000);
