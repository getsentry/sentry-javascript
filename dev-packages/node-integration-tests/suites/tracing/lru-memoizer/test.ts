import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';
import { createCjsTests } from '../../../utils/runner/createEsmAndCjsTests';

describe('lru-memoizer', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Each case maps to the OpenTelemetry default and the diagnostics-channel opt-in
  // variants, mirroring the mysql suite. `flags` are extra Node CLI flags; the
  // instrument file is always loaded via `--import` (esm) / `--require` (cjs).
  //
  // lru-memoizer creates no spans, so there's no `sentry.origin` to
  // assert: the opt-in cases prove the channel ran because the opt-in removes the
  // OTel integration via `replacedOtelIntegrationNames`.
  const CASES = [
    // OpenTelemetry default — no opt-in, no injection. (OTel does not support ESM.)
    { label: 'opentelemetry (default)', instrument: 'instrument.mjs', flags: [], failsOnEsm: true },
    // Opt-in via init only. `Sentry.init()` injects the channels synchronously.
    {
      label: 'diagnostics-channel (init opt-in)',
      instrument: 'instrument-orchestrion.mjs',
      flags: [],
      failsOnEsm: false,
    },
    // Opt-in and rely on `node --import @sentry/node/import`.
    {
      label: 'diagnostics-channel (--import @sentry/node/import opt-in)',
      instrument: 'instrument-orchestrion.mjs',
      flags: ['--import', '@sentry/node/import'],
      failsOnEsm: false,
    },
    // Without opt-in: channels are injected unconditionally but not subscribed to,
    // so the OTel instrumentation does the work — proves injecting the channels has
    // no downside. (OTel does not support ESM.)
    {
      label: 'opentelemetry (channels injected, no opt-in)',
      instrument: 'instrument.mjs',
      flags: ['--import', '@sentry/node/import'],
      failsOnEsm: true,
    },
  ] as const;

  for (const { label, instrument, flags, failsOnEsm } of CASES) {
    describe(label, () => {
      createEsmAndCjsTests(
        __dirname,
        'scenario.mjs',
        instrument,
        (createTestRunner, test) => {
          test('keeps outer context inside the memoized inner functions', async () => {
            await createTestRunner()
              .withFlags(...flags)
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
        { failsOnEsm },
      );

      // CJS-only: the parallel scenario is flaky in ESM (see #21729).
      createCjsTests(__dirname, 'scenario-parallel.mjs', instrument, (createTestRunner, test) => {
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

          await createTestRunner().withFlags(...flags).expect(expectation).expect(expectation).start().completed();
        });
      });
    });
  }
});
