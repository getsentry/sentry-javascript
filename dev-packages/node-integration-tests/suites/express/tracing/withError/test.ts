import { afterAll, describe } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('express tracing with error', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should apply the scope transactionName to error events', async () => {
      const runner = createRunner()
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
