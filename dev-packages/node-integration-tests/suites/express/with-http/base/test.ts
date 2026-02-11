import { afterAll, describe } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('express with http import', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works when importing the http module', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /test2',
          },
        })
        .expect({
          transaction: {
            transaction: 'GET /test',
          },
        })
        .expect({
          transaction: {
            transaction: 'GET /test3',
          },
        })
        .start();
      await runner.makeRequest('get', '/test');
      await runner.makeRequest('get', '/test3');
      await runner.completed();
    });
  });
});
