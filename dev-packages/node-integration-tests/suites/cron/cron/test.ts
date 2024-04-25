import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('node-cron types should match', done => {
  createRunner(__dirname, 'scenario.ts')
    .ignore('event', 'session')
    .expect({
      check_in: {
        check_in_id: expect.any(String),
        monitor_slug: 'my-cron-job',
        status: 'in_progress',
        release: '1.0',
        monitor_config: { schedule: { type: 'crontab', value: '* * * * * *' } },
        contexts: {
          trace: {
            trace_id: expect.any(String),
            span_id: expect.any(String),
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
            trace_id: expect.any(String),
            span_id: expect.any(String),
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
        monitor_config: { schedule: { type: 'crontab', value: '* * * * * *' } },
        contexts: {
          trace: {
            trace_id: expect.any(String),
            span_id: expect.any(String),
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
            trace_id: expect.any(String),
            span_id: expect.any(String),
          },
        },
      },
    })
    .start(done);
});
