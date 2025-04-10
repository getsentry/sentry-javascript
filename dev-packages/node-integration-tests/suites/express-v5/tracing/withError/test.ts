import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('express tracing experimental', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('should apply the scope transactionName to error events', async () => {
      const runner = createRunner(__dirname, 'server.js')
        .ignore('transaction')
        .expect({
          event: {
            exception: {
              values: [
                {
                  value: 'error_1',
                },
              ],
            },
            transaction: 'GET /test/:id1/:id2',
          },
        })
        .start();
      runner.makeRequest('get', '/test/123/abc?q=1');
      await runner.completed();
    });
  });
});
