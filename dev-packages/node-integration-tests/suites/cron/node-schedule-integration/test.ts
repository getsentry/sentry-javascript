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
    test('sends ordered check-ins and captures job errors', async () => {
      const checkIns: unknown[] = [];
      const expectedCheckIns = [
        {
          monitor_slug: 'new-job',
          status: 'in_progress',
          monitor_config: { schedule: { type: 'crontab', value: '0 0 * * *' }, timezone: 'UTC' },
        },
        { monitor_slug: 'new-job', status: 'ok' },
        { monitor_slug: 'my-schedule-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        { monitor_slug: 'my-schedule-job', status: 'ok', duration: expect.any(Number) },
        { monitor_slug: 'my-schedule-job', status: 'in_progress', monitor_config: MONITOR_CONFIG },
        { monitor_slug: 'my-schedule-job', status: 'error', duration: expect.any(Number) },
        {
          monitor_slug: 'my-schedule-job',
          status: 'in_progress',
          monitor_config: { schedule: { type: 'crontab', value: '0 8 * * *' }, timezone: 'UTC' },
        },
        { monitor_slug: 'my-schedule-job', status: 'ok', duration: expect.any(Number) },
      ];
      const runner = createRunner().unordered();
      for (const _checkIn of expectedCheckIns) {
        runner.expect({
          check_in: checkIn => {
            checkIns.push(checkIn);
          },
        });
      }
      await runner
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
      expect(checkIns).toMatchObject(
        expectedCheckIns.map(checkIn => ({ check_in_id: expect.any(String), ...checkIn })),
      );
    });
  });
});
