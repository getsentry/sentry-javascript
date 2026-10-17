import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('graphile-worker crontab monitoring', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  for (const version of ['0.16.6', '0.18.0']) {
    describe(`graphile-worker ${version}`, () => {
      createEsmAndCjsTests(
        __dirname,
        'scenario.mjs',
        'instrument.mjs',
        (createRunner, test) => {
          test('sends check-ins for crontab jobs', { timeout: 90_000 }, async () => {
            await createRunner()
              .unordered()
              .expect({
                check_in: {
                  check_in_id: expect.any(String),
                  monitor_slug: 'hourly-report',
                  status: 'in_progress',
                  release: '1.0',
                },
              })
              .expect({
                check_in: {
                  check_in_id: expect.any(String),
                  monitor_slug: 'hourly-report',
                  status: 'ok',
                  release: '1.0',
                  duration: expect.any(Number),
                },
              })
              .expect({
                check_in: {
                  check_in_id: expect.any(String),
                  monitor_slug: 'failing_task',
                  status: 'in_progress',
                  release: '1.0',
                },
              })
              .expect({
                check_in: {
                  check_in_id: expect.any(String),
                  monitor_slug: 'failing_task',
                  status: 'error',
                  release: '1.0',
                  duration: expect.any(Number),
                },
              })
              .expect({
                event: {
                  exception: {
                    values: [
                      {
                        type: 'Error',
                        value: 'Cron job failed',
                        mechanism: { type: 'auto.function.graphile_worker.cron', handled: false },
                      },
                    ],
                  },
                },
              })
              .start()
              .completed();
          });
        },
        { additionalDependencies: { 'graphile-worker': version } },
      );
    });
  }
});
