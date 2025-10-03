import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('allows to call init multiple times', async ({ signal }) => {
  const runner = createRunner({ signal }, __dirname, 'server.ts')
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
    .expect({
      event: {
        exception: {
          values: [
            {
              value: 'Final exception was captured',
            },
          ],
        },
      },
    })
    .start();

  runner
    .makeRequest('get', '/test/no-init')
    .then(() => runner.makeRequest('get', '/test/error/1'))
    .then(() => runner.makeRequest('get', '/test/init'))
    .then(() => runner.makeRequest('get', '/test/error/2'))
    .then(() => runner.makeRequest('get', '/test/error/3'));

  await runner.completed();
});
