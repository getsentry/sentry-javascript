import type { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';
import { startMysqlTestServer } from './mysql-test-server';

describe('mysql auto instrumentation', () => {
  // A minimal in-process MySQL server (on a random free port) so the client's
  // connection handshake succeeds. Without it, `createPool()` queries fail at
  // connection acquisition — before `connection.query` runs — so the
  // diagnostics-channel instrumentation (which hooks `connection.query`) never
  // sees them. Queries still error (the server rejects them), so spans keep
  // `status: internal_error` as the assertions expect. The port is passed to
  // each scenario via the `MYSQL_PORT` env var.
  let mysqlServer: Server;
  let mysqlPort: number;
  beforeAll(async () => {
    mysqlServer = startMysqlTestServer();
    await new Promise<void>(resolve => mysqlServer.once('listening', () => resolve()));
    mysqlPort = (mysqlServer.address() as AddressInfo).port;
  });

  afterAll(() => {
    mysqlServer?.close();
    cleanupChildProcesses();
  });

  // Builds the expected transaction. When `origin` is given, the spans must also
  // carry that `sentry.origin`, which is how we assert that the
  // diagnostics-channel instrumentation (not the OTel one) produced them. A
  // scenario can pass `override` to replace the default transaction expectation
  // (e.g. the streamed-error scenario, which runs a different, failing query).
  function expectedTransaction(
    port: number,
    origin: string | undefined,
    override: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const span = (description: string): ReturnType<typeof expect.objectContaining> =>
      expect.objectContaining({
        description,
        op: 'db',
        ...(origin ? { origin } : {}),
        data: expect.objectContaining({
          'db.system': 'mysql',
          'net.peer.name': 'localhost',
          'net.peer.port': port,
          'db.user': 'root',
        }),
        status: 'ok',
      });

    return {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([span('SELECT 1 + 1 AS solution'), span('SELECT NOW()')]),
      ...(override ?? {}),
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
    ['scenario-withPool.mjs', 'using createPool()'],
    [
      'scenario-streamError.mjs',
      'streamed query error',
      {
        // The transaction itself succeeds (status `ok`); only the failing query's child span is errored.
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'SELECT * FROM does_not_exist',
            op: 'db',
            // A failing streamed query emits `error`, which marks the span as errored
            status: 'internal_error',
            data: expect.objectContaining({
              'db.system': 'mysql',
              'db.user': 'root',
            }),
          }),
        ]),
      },
    ],
  ] as const;

  for (const { label, instrument, flags, origin, failsOnEsm } of CASES) {
    describe(label, () => {
      for (const [scenario, description, transactionOverride] of SCENARIOS) {
        createEsmAndCjsTests(
          __dirname,
          scenario,
          instrument,
          (createRunner, test) => {
            test(`should auto-instrument \`mysql\` package when ${description}`, async () => {
              await createRunner()
                .withEnv({ MYSQL_PORT: String(mysqlPort) })
                .withFlags(...flags)
                .expect({ transaction: expectedTransaction(mysqlPort, origin, transactionOverride) })
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
