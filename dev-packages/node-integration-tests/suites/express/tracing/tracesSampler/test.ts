import { afterAll, describe } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('express tracesSampler', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('correctly samples & passes data to tracesSampler', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /test/:id',
          },
        })
        .start();

      // This is not sampled
      runner.makeRequest('get', '/test2?q=1');
      // This is sampled
      runner.makeRequest('get', '/test/123?q=1');
      await runner.completed();
    });
  });

  describe('normalizedRequest data', () => {
    createCjsTests(
      __dirname,
      'scenario-normalized-request.mjs',
      'instrument-normalized-request.mjs',
      (createRunner, test) => {
        test('correctly samples & passes normalizedRequest data to tracesSampler', async () => {
          const runner = createRunner()
            .expect({
              transaction: {
                transaction: 'GET /test-normalized-request',
              },
            })
            .start();

          runner.makeRequest('get', '/test-normalized-request?query=123');
          await runner.completed();
        });
      },
    );
  });
});
