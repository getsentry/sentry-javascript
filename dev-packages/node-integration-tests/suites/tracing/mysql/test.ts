import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('mysql auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'SELECT 1 + 1 AS solution',
        op: 'db',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
      expect.objectContaining({
        description: 'SELECT NOW()',
        op: 'db',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
    ]),
  };

  describe.each([
    ['opentelemetry-based', 'instrument.mjs'],
    ['orchestrion-based', 'instrument-orchestrion.mjs'],
  ])('%s', (instrumentation, instrumentFile) => {
    // esm is not supported for the otel instrumentation
    const failsOnEsm = instrumentation === 'opentelemetry-based';

    // The orchestrion path is activated via the `--import @sentry/node/orchestrion`
    // CLI flag. That single ESM hook instruments both ESM and CJS user code (via
    // `Module.registerHooks` where available, otherwise `Module.register` + the
    // CJS `Module._compile` patch), so the same flag covers the esm and cjs
    // scenarios. The OTel path needs no extra flag.
    const orchestrionFlags = instrumentation === 'orchestrion-based' ? ['--import', '@sentry/node/orchestrion'] : [];

    createEsmAndCjsTests(
      __dirname,
      'scenario-withConnect.mjs',
      instrumentFile,
      (createRunner, test) => {
        test('should auto-instrument `mysql` package when using connection.connect()', async () => {
          await createRunner()
            .withFlags(...orchestrionFlags)
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { failsOnEsm },
    );

    createEsmAndCjsTests(
      __dirname,
      'scenario-withoutCallback.mjs',
      instrumentFile,
      (createRunner, test) => {
        test('should auto-instrument `mysql` package when using query without callback', async () => {
          await createRunner()
            .withFlags(...orchestrionFlags)
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { failsOnEsm },
    );

    createEsmAndCjsTests(
      __dirname,
      'scenario-withoutConnect.mjs',
      instrumentFile,
      (createRunner, test) => {
        test('should auto-instrument `mysql` package without connection.connect()', async () => {
          await createRunner()
            .withFlags(...orchestrionFlags)
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { failsOnEsm },
    );
  });
});
