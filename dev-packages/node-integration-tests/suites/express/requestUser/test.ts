import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('express user handling', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('ignores user from request', async () => {
    expect.assertions(2);

    const runner = createRunner(__dirname, 'server.js')
      .expect({
        event: event => {
          expect(event.user).toBeUndefined();
          expect(event.exception?.values?.[0]?.value).toBe('error_1');
        },
      })
      .start();
    runner.makeRequest('get', '/test1', { expectError: true });
    await runner.completed();
  });

  test('using setUser in middleware works', async () => {
    const runner = createRunner(__dirname, 'server.js')
      .expect({
        event: {
          user: {
            id: '2',
            email: 'test2@sentry.io',
          },
          exception: {
            values: [
              {
                value: 'error_2',
              },
            ],
          },
        },
      })
      .start();
    runner.makeRequest('get', '/test2', { expectError: true });
    await runner.completed();
  });
});
