import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('bullmq job scheduler check-ins', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('sends check-ins with the job scheduler schedule', { timeout: 60_000 }, async () => {
    await createRunner(__dirname, 'scenario.ts')
      .unordered()
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'every-scheduler',
          status: 'in_progress',
          release: '1.0',
          monitor_config: { schedule: { type: 'interval', value: 5, unit: 'minute' } },
        },
      })
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'every-scheduler',
          status: 'ok',
          release: '1.0',
          duration: expect.any(Number),
        },
      })
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'pattern-scheduler',
          status: 'in_progress',
          release: '1.0',
          monitor_config: { schedule: { type: 'crontab', value: '0 9 * * 1-5' }, timezone: 'Europe/Vienna' },
        },
      })
      .expect({
        check_in: {
          check_in_id: expect.any(String),
          monitor_slug: 'pattern-scheduler',
          status: 'error',
          release: '1.0',
          duration: expect.any(Number),
        },
      })
      .start()
      .completed();
  });
});
