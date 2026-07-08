import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../utils/runner';

describe('express user handling', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('ignores user from request', async () => {
      const runner = createRunner()
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
      const runner = createRunner()
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
});
