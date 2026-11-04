import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

const MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: '0 9 * * 1-5' },
  timezone: 'Europe/Vienna',
};

afterAll(() => {
  cleanupChildProcesses();
});

test('node-cron instrumentation', { timeout: 30_000 }, async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      check_in: {
        check_in_id: expect.any(String),
        monitor_slug: 'my-cron-job',
        status: 'in_progress',
        release: '1.0',
        monitor_config: MONITOR_CONFIG,
        contexts: {
          trace: {
            trace_id: expect.stringMatching(/[a-f\d]{32}/),
            span_id: expect.stringMatching(/[a-f\d]{16}/),
          },
        },
      },
    })
    .expect({
      check_in: {
        check_in_id: expect.any(String),
        monitor_slug: 'my-cron-job',
        status: 'ok',
        release: '1.0',
        duration: expect.any(Number),
        contexts: {
          trace: {
            trace_id: expect.stringMatching(/[a-f\d]{32}/),
            span_id: expect.stringMatching(/[a-f\d]{16}/),
          },
        },
      },
    })
    .expect({
      check_in: {
        check_in_id: expect.any(String),
        monitor_slug: 'my-cron-job',
        status: 'in_progress',
        release: '1.0',
        monitor_config: MONITOR_CONFIG,
        contexts: {
          trace: {
            trace_id: expect.stringMatching(/[a-f\d]{32}/),
            span_id: expect.stringMatching(/[a-f\d]{16}/),
          },
        },
      },
    })
    .expect({
      check_in: {
        check_in_id: expect.any(String),
        monitor_slug: 'my-cron-job',
        status: 'error',
        release: '1.0',
        duration: expect.any(Number),
        contexts: {
          trace: {
            trace_id: expect.stringMatching(/[a-f\d]{32}/),
            span_id: expect.stringMatching(/[a-f\d]{16}/),
          },
        },
      },
    })
    .expect({
      event: {
        exception: { values: [{ type: 'Error', value: 'Error in cron job' }] },
      },
    })
    .start()
    .completed();
});
