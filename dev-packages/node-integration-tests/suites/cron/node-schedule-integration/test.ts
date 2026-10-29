import type { SerializedCheckIn } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: '30 9 * * 1-5' },
  timezone: 'Europe/Vienna',
};

const expectNoConfig = (slug: string) => (checkIn: SerializedCheckIn) => {
  expect(checkIn).toMatchObject({ monitor_slug: slug, status: 'in_progress' });
  expect(checkIn.monitor_config).toBeUndefined();
};

describe('nodeScheduleIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sends check-ins for named jobs', async () => {
      await createRunner()
        .ignore('event')
        .expect({ check_in: expectNoConfig('rule-job') })
        .expect({ check_in: { monitor_slug: 'rule-job', status: 'ok' } })
        .expect({ check_in: expectNoConfig('ending-job') })
        .expect({ check_in: { monitor_slug: 'ending-job', status: 'ok' } })
        .expect({
          check_in: {
            monitor_slug: 'new-job',
            status: 'in_progress',
            monitor_config: { schedule: { type: 'crontab', value: '0 0 * * *' }, timezone: 'UTC' },
          },
        })
        .expect({ check_in: { monitor_slug: 'new-job', status: 'ok' } })
        .expect({
          check_in: { monitor_slug: 'my-schedule-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        })
        .expect({ check_in: { monitor_slug: 'my-schedule-job', status: 'ok', duration: expect.any(Number) } })
        .expect({
          check_in: { monitor_slug: 'my-schedule-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        })
        .expect({ check_in: { monitor_slug: 'my-schedule-job', status: 'error', duration: expect.any(Number) } })
        .expect({
          check_in: {
            monitor_slug: 'my-schedule-job',
            status: 'in_progress',
            monitor_config: { schedule: { type: 'crontab', value: '0 8 * * *' }, timezone: 'UTC' },
          },
        })
        .expect({ check_in: { monitor_slug: 'my-schedule-job', status: 'ok', duration: expect.any(Number) } })
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
                  value: 'Error in scheduled job',
                  mechanism: { type: 'auto.function.node-schedule', handled: false },
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
