import { afterAll, describe, expect } from 'vitest';
import { assertSentryTransaction } from '../../../utils/assertions';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('express late init', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('applies expressIntegration config set via Sentry.init() called after instrumentExpress()', async () => {
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
            // request_handler span IS present
            // confirms the express patch was applied.
            expect(transaction.spans).toContainEqual(
              expect.objectContaining({
                data: expect.objectContaining({
                  'express.type': 'request_handler',
                }),
              }),
            );
            // Middleware spans NOT present, ignoreLayersType: ['middleware']
            // configured via the Sentry.init() AFTER instrumentExpress().
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
