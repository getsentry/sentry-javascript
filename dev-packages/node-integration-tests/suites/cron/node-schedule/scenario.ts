import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as schedule from 'node-schedule';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const scheduleWithCheckIn = Sentry.cron.instrumentNodeSchedule(schedule);

let closeNext = false;

const job = scheduleWithCheckIn.scheduleJob('my-cron-job', '0 9 * * 1-5', () => {
  if (closeNext) {
    throw new Error('Error in cron job');
  }

  closeNext = true;
});

// Run the job without waiting for its schedule.
job.cancel();
// The second run's error is unhandled, like when node-schedule runs the job.
void Promise.resolve(job.invoke()).then(() => job.invoke());

setTimeout(() => {
  process.exit();
}, 10_000);
