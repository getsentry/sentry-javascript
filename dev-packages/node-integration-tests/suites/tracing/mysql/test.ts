import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('mysql auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Builds the expected transaction. When `origin` is given, the spans must also
  // carry that `sentry.origin`, which is how we assert that the
  // diagnostics-channel instrumentation (not the OTel one) produced them.
  function expectedTransaction(origin?: string): Record<string, unknown> {
    const span = (description: string): ReturnType<typeof expect.objectContaining> =>
      expect.objectContaining({
        description,
        op: 'db',
        ...(origin ? { origin } : {}),
        data: expect.objectContaining({
          'db.system': 'mysql',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
        // all db spans have an error status because we don't have an actual mysql DB server running for these tests
        status: 'internal_error',
      });

    return {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([span('SELECT 1 + 1 AS solution'), span('SELECT NOW()')]),
    };
  }

  const CHANNEL_ORIGIN = 'auto.db.orchestrion.mysql';

  // Each case maps to one of the two documented use cases, in opt-in and
  // non-opt-in form. `flags` are extra Node CLI flags; the instrument file is
  // always loaded via `--import` (esm) / `--require` (cjs) by the runner.
  const CASES = [
    // OpenTelemetry default — no opt-in, no injection. (OTel does not support ESM.)
    { label: 'opentelemetry (default)', instrument: 'instrument.mjs', flags: [], origin: undefined, failsOnEsm: true },
    // Opt-in via init only. `Sentry.init()` injects the channels synchronously.
    {
      label: 'diagnostics-channel (init opt-in)',
      instrument: 'instrument-orchestrion.mjs',
      flags: [],
      origin: CHANNEL_ORIGIN,
      failsOnEsm: false,
    },
    // Opt-in and rely on `node --import @sentry/node/import`.
    {
      label: 'diagnostics-channel (--import @sentry/node/import opt-in)',
      instrument: 'instrument-orchestrion.mjs',
      flags: ['--import', '@sentry/node/import'],
      origin: CHANNEL_ORIGIN,
      failsOnEsm: false,
    },
    // Without opt-in: channels are injected unconditionally but not subscribed
    // to, so the OTel instrumentation records the spans — proves injecting the
    // channels has no downside. (OTel does not support ESM.)
    {
      label: 'opentelemetry (channels injected, no opt-in)',
      instrument: 'instrument.mjs',
      flags: ['--import', '@sentry/node/import'],
      origin: undefined,
      failsOnEsm: true,
    },
  ] as const;

  const SCENARIOS = [
    ['scenario-withConnect.mjs', 'using connection.connect()'],
    ['scenario-withoutCallback.mjs', 'using query without callback'],
    ['scenario-withoutConnect.mjs', 'without connection.connect()'],
  ] as const;

  for (const { label, instrument, flags, origin, failsOnEsm } of CASES) {
    describe(label, () => {
      const expected = expectedTransaction(origin);

      for (const [scenario, description] of SCENARIOS) {
        createEsmAndCjsTests(
          __dirname,
          scenario,
          instrument,
          (createRunner, test) => {
            test(`should auto-instrument \`mysql\` package when ${description}`, async () => {
              await createRunner()
                .withFlags(...flags)
                .expect({ transaction: expected })
                .start()
                .completed();
            });
          },
          { failsOnEsm },
        );
      }
    });
  }
});
