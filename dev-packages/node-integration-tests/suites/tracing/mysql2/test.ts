import { afterAll, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('mysql2 auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // With orchestrion injection enabled (`INJECT_ORCHESTRION`), the diagnostics-channel integration
  // records the spans instead of the OTel patcher, so they carry a different `sentry.origin`.
  const ORIGIN = isOrchestrionEnabled() ? 'auto.db.mysql2' : 'auto.db.otel.mysql2';

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'SELECT 1 + 1 AS solution',
        op: 'db',
        origin: ORIGIN,
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT 1 + 1 AS solution',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
      // bind values are left as `?` placeholders in `db.statement` (not inlined)
      expect.objectContaining({
        description: 'SELECT ? as a, ? as b, NOW() as c',
        op: 'db',
        origin: ORIGIN,
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT ? as a, ? as b, NOW() as c',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
      // a single non-array bind value is also left as a `?` placeholder in `db.statement`
      expect.objectContaining({
        description: 'SELECT ? AS scalar_value',
        op: 'db',
        origin: ORIGIN,
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT ? AS scalar_value',
        }),
      }),
      // `execute` is instrumented the same way as `query`
      expect.objectContaining({
        description: 'SELECT 42 AS answer',
        op: 'db',
        origin: ORIGIN,
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT 42 AS answer',
        }),
      }),
      // a failing query produces a span with an error status
      expect.objectContaining({
        description: 'SELECT * FROM does_not_exist',
        op: 'db',
        status: 'internal_error',
        origin: ORIGIN,
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT * FROM does_not_exist',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `mysql2` package without connection.connect()', { timeout: 75_000 }, async () => {
      await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });
  });
});
