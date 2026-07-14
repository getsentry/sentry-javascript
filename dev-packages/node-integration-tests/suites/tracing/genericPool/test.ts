import { afterAll, describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('genericPool auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // The orchestrion channel integration replaces the OTel one 1:1 but tags spans with its own origin.
  const ORIGIN = isOrchestrionEnabled() ? 'auto.db.orchestrion.generic_pool' : 'auto.db.otel.generic_pool';

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should auto-instrument `genericPool` package when calling pool.require()', async () => {
      const EXPECTED_TRANSACTION = {
        transaction: 'Test Transaction',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'generic-pool.acquire',
            origin: ORIGIN,
            data: {
              'sentry.origin': ORIGIN,
            },
            status: 'ok',
          }),

          expect.objectContaining({
            description: 'generic-pool.acquire',
            origin: ORIGIN,
            data: {
              'sentry.origin': ORIGIN,
            },
            status: 'ok',
          }),
        ]),
      };

      await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error.mjs', 'instrument.mjs', (createRunner, test) => {
    test('marks the `generic-pool.acquire` span as errored when acquiring fails', async () => {
      // The orchestrion path also records the rejection's `error.type` on the span.
      const errorData = isOrchestrionEnabled()
        ? { 'sentry.origin': ORIGIN, 'error.type': 'TimeoutError' }
        : { 'sentry.origin': ORIGIN };

      const EXPECTED_TRANSACTION = {
        transaction: 'Test Transaction',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'generic-pool.acquire',
            origin: ORIGIN,
            data: errorData,
            status: 'internal_error',
          }),
        ]),
      };

      await createRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });
  });
});
