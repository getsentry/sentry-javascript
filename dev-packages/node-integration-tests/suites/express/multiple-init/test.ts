import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('allows to call init multiple times', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('session', 'sessions')
    .expect({
      event: {
        exception: {
          values: [
            {
              value: 'This is an exception 2',
            },
          ],
        },
        breadcrumbs: [
          {
            message: 'error breadcrumb 2',
            timestamp: expect.any(Number),
          },
        ],
        tags: {
          global: 'tag',
          error: '2',
        },
      },
    })
    .expect({
      event: {
        exception: {
          values: [
            {
              value: 'This is an exception 3',
            },
          ],
        },
        breadcrumbs: [
          {
            message: 'error breadcrumb 3',
            timestamp: expect.any(Number),
          },
        ],
        tags: {
          global: 'tag',
          error: '3',
        },
      },
    })
    .start(done);

  runner
    .makeRequest('get', '/test/no-init')
    .then(() => runner.makeRequest('get', '/test/error/1'))
    .then(() => runner.makeRequest('get', '/test/init'))
    .then(() => runner.makeRequest('get', '/test/error/2'))
    .then(() => runner.makeRequest('get', '/test/error/3'));
});
