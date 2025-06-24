import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import * as schedule from 'node-schedule';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

const scheduleWithCheckIn = Sentry.cron.instrumentNodeSchedule(schedule);

let closeNext = false;

const job = scheduleWithCheckIn.scheduleJob('my-cron-job', '* * * * * *', () => {
  if (closeNext) {
    job.cancel();
    throw new Error('Error in cron job');
  }

  // eslint-disable-next-line no-console
  console.log('You will see this message every second');
  closeNext = true;
});

setTimeout(() => {
  process.exit();
}, 5000);
