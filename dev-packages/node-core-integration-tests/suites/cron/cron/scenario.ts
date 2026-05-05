import * as Sentry from '@sentry/node-core';
import { CronJob } from 'cron';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
});

setupOtel(client);

const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, 'my-cron-job');

let closeNext = false;

const cron = new CronJobWithCheckIn('* * * * * *', () => {
  if (closeNext) {
    cron.stop();
    throw new Error('Error in cron job');
  }

  // eslint-disable-next-line no-console
  console.log('You will see this message every second');
  closeNext = true;
});

cron.start();

setTimeout(() => {
  process.exit();
}, 5000);
