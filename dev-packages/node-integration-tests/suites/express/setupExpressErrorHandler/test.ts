import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('express setupExpressErrorHandler', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('allows to pass options to setupExpressErrorHandler', async () => {
      const runner = createRunner(__dirname, 'server.js')
        .expect({
          event: {
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

      // this error is filtered & ignored
      runner.makeRequest('get', '/test1', { expectError: true });
      // this error is actually captured
      runner.makeRequest('get', '/test2', { expectError: true });

      await runner.completed();
    });
  });
});
