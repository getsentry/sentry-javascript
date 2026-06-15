import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('mysql2 auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'SELECT 1 + 1 AS solution',
        op: 'db',
        origin: 'auto.db.otel.mysql2',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT 1 + 1 AS solution',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
      expect.objectContaining({
        description: 'SELECT NOW()',
        op: 'db',
        origin: 'auto.db.otel.mysql2',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT NOW()',
          'net.peer.name': 'localhost',
          'net.peer.port': 3306,
          'db.user': 'root',
        }),
      }),
      // `execute` is instrumented the same way as `query`
      expect.objectContaining({
        description: 'SELECT 42 AS answer',
        op: 'db',
        origin: 'auto.db.otel.mysql2',
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
        origin: 'auto.db.otel.mysql2',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT * FROM does_not_exist',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `mysql` package without connection.connect()', { timeout: 75_000 }, async () => {
      await createTestRunner()
        .withDockerCompose({ workingDirectory: [__dirname] })
        .expect({ transaction: EXPECTED_TRANSACTION })
        .start()
        .completed();
    });
  });
});
