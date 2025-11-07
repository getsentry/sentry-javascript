import { withMonitor } from '@sentry/node';

export async function run(): Promise<void> {
  // First withMonitor call without isolateTrace (should share trace)
  await withMonitor('cron-job-1', async () => {
    // Simulate some work
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }, {
    schedule: { type: 'crontab', value: '* * * * *' }
  });

  // Second withMonitor call with isolateTrace (should have different trace)
  await withMonitor('cron-job-2', async () => {
    // Simulate some work
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }, {
    schedule: { type: 'crontab', value: '* * * * *' },
    isolateTrace: true
  });
}
