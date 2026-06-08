import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('genericPool v2 auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('should auto-instrument `generic-pool` v2 when calling pool.acquire()', async () => {
        const EXPECTED_TRANSACTION = {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: expect.stringMatching(/^generic-pool\.ac?quire/),
              origin: 'auto.db.otel.generic_pool',
              data: {
                'sentry.origin': 'auto.db.otel.generic_pool',
              },
              status: 'ok',
            }),

            expect.objectContaining({
              description: expect.stringMatching(/^generic-pool\.ac?quire/),
              origin: 'auto.db.otel.generic_pool',
              data: {
                'sentry.origin': 'auto.db.otel.generic_pool',
              },
              status: 'ok',
            }),
          ]),
        };

        await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    },
    { additionalDependencies: { 'generic-pool': '^2.5.0' } },
  );
});
