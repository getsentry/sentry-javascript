import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, 'my-cron-job');

setTimeout(() => {
  process.exit(0);
}, 1_000);
