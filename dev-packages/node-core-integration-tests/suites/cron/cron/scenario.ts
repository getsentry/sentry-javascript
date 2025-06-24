import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { CronJob } from 'cron';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
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
