import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});


Sentry.withMonitor(
  'cron-job-1',
  async () => {
    await new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  },
  {
    schedule: { type: 'crontab', value: '* * * * *' },
  },
);


Sentry.withMonitor(
  'cron-job-2',
  async () => {
    await new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  },
  {
    schedule: { type: 'crontab', value: '* * * * *' },
    isolateTrace: true,
  },
);

setTimeout(() => {
  process.exit();
}, 500);
