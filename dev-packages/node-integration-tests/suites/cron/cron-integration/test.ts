import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: '30 9 * * 1-5' },
  timezone: 'Europe/Vienna',
};

describe('cronJobIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sends check-ins for named jobs', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          check_in: { monitor_slug: 'my-cron-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        })
        .expect({ check_in: { monitor_slug: 'my-cron-job', status: 'ok', duration: expect.any(Number) } })
        .expect({
          check_in: { monitor_slug: 'my-cron-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        })
        .expect({ check_in: { monitor_slug: 'my-cron-job', status: 'error', duration: expect.any(Number) } })
        .expect({
          check_in: {
            monitor_slug: 'my-cron-job',
            status: 'in_progress',
            monitor_config: { schedule: { type: 'crontab', value: '0 8 * * *' }, timezone: 'UTC' },
          },
        })
        .expect({ check_in: { monitor_slug: 'my-cron-job', status: 'ok', duration: expect.any(Number) } })
        .start()
        .completed();
    });

    test('captures job errors', async () => {
      await createRunner()
        .unordered()
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'Error in cron job',
                  mechanism: { type: 'auto.function.cron', handled: false },
                },
              ],
            },
          },
        })
        .start()
        .completed();
    });
  });
});
