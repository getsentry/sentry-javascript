import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('express with http import xxx', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    createRunner => {
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
      // TODO: This is failing on ESM because importing http is triggering the http spans twice :(
      // We need to fix this!
    },
    { skipEsm: true },
  );
});
