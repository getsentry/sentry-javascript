import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: '30 9 * * 1-5' },
  timezone: 'Europe/Vienna',
};

describe('nodeScheduleIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sends check-ins for named jobs', async () => {
      await createRunner()
        .expect({ check_in: { monitor_slug: 'rule-job', status: 'in_progress' } })
        .expect({ check_in: { monitor_slug: 'rule-job', status: 'ok' } })
        .expect({
          check_in: { monitor_slug: 'my-schedule-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        })
        .expect({ check_in: { monitor_slug: 'my-schedule-job', status: 'ok', duration: expect.any(Number) } })
        .expect({
          check_in: { monitor_slug: 'my-schedule-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        })
        .expect({ check_in: { monitor_slug: 'my-schedule-job', status: 'error', duration: expect.any(Number) } })
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
