import { afterAll, describe, expect } from 'vitest';
import { assertSentryTransaction } from '../../../utils/assertions';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('express ignoreLayersType', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('suppresses spans for layer types listed in ignoreLayersType', async () => {
      const runner = createRunner()
        .expect({
          transaction: transaction => {
            assertSentryTransaction(transaction, {
              transaction: 'GET /test/express',
              contexts: {
                trace: {
                  op: 'http.server',
                  status: 'ok',
                },
              },
            });
            expect(transaction.spans).toContainEqual(
              expect.objectContaining({
                data: expect.objectContaining({
                  'express.type': 'request_handler',
                }),
              }),
            );
            // The cors() middleware span is suppressed by ignoreLayersType: ['middleware'].
            expect(transaction.spans).not.toContainEqual(
              expect.objectContaining({
                data: expect.objectContaining({
                  'express.type': 'middleware',
                }),
              }),
            );
          },
        })
        .start();
      runner.makeRequest('get', '/test/express');
      await runner.completed();
    });
  });
});
