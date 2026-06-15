import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('lru-memoizer', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('keeps outer context inside the memoized inner functions', async () => {
        await createTestRunner()
          .expect({
            transaction: {
              transaction: '<unknown>',
              contexts: {
                trace: expect.objectContaining({
                  op: 'run',
                  data: expect.objectContaining({
                    'sentry.op': 'run',
                    'sentry.origin': 'manual',
                    'memoized.context_preserved': true,
                  }),
                }),
              },
            },
          })
          .start()
          .completed();
      });
    },
    { failsOnEsm: true },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-parallel.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('keeps each span context across parallel memoized requests', async () => {
        // Each parallel request emits a transaction whose callback must have run in its own context.
        // Two identical expectations keep this order-independent.
        const expectation = {
          transaction: {
            contexts: {
              trace: expect.objectContaining({
                op: expect.stringMatching(/^(first|second)$/),
                data: expect.objectContaining({ 'memoized.context_preserved': true }),
              }),
            },
          },
        };

        await createTestRunner().expect(expectation).expect(expectation).start().completed();
      });
    },
    { failsOnEsm: true },
  );
});
