import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as cron from 'node-cron';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

const cronWithCheckIn = Sentry.cron.instrumentNodeCron(cron);

let closeNext = false;

const task = cronWithCheckIn.schedule(
  '* * * * * *',
  () => {
    if (closeNext) {
      // https://github.com/node-cron/node-cron/issues/317
      setImmediate(() => {
        task.stop();
      });

      throw new Error('Error in cron job');
    }

    // eslint-disable-next-line no-console
    console.log('You will see this message every second');
    closeNext = true;
  },
  { name: 'my-cron-job' },
);

setTimeout(() => {
  process.exit();
}, 5000);
