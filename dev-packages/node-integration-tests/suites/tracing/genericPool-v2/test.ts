import { ERROR_TYPE, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
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
        const EXPECTED_SPANS = {
          items: expect.arrayContaining([
            expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
            expect.objectContaining({
              name: 'generic-pool.acquire',
              attributes: expect.objectContaining({
                [SENTRY_OP]: { type: 'string', value: DB },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.generic_pool' },
              }),
              status: 'ok',
            }),

            expect.objectContaining({
              name: 'generic-pool.acquire',
              attributes: expect.objectContaining({
                [SENTRY_OP]: { type: 'string', value: DB },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.generic_pool' },
              }),
              status: 'ok',
            }),
          ]),
        };

        await createRunner().expect({ span: EXPECTED_SPANS }).start().completed();
      });
    },
    { additionalDependencies: { 'generic-pool': '^2.5.0' } },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-error.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('marks the `generic-pool.acquire` span as errored when acquiring fails', async () => {
        const EXPECTED_SPANS = {
          items: expect.arrayContaining([
            expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
            expect.objectContaining({
              name: 'generic-pool.acquire',
              attributes: expect.objectContaining({
                [SENTRY_OP]: { type: 'string', value: DB },
                [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.generic_pool' },
                [ERROR_TYPE]: { type: 'string', value: 'Error' },
              }),
              status: 'error',
            }),
          ]),
        };

        await createRunner().expect({ span: EXPECTED_SPANS }).start().completed();
      });
    },
    { additionalDependencies: { 'generic-pool': '^2.5.0' } },
  );
});
