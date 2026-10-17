import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('graphile-worker crontab monitoring', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // 0.18 ships only ES modules. The CJS test `require()`s it, which the module hooks don't see on Node 20 or Deno.
  for (const [version, runIf] of [
    ['0.16.6', true],
    ['0.18.0', supports({ min: 22, runtimes: ['node'] })],
  ] as const) {
    describe.runIf(runIf)(`graphile-worker ${version}`, () => {
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
                  monitor_config: { schedule: { type: 'crontab', value: '0 * * * *' }, timezone: 'UTC' },
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
                  monitor_config: { schedule: { type: 'crontab', value: '30 * * * *' }, timezone: 'UTC' },
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
