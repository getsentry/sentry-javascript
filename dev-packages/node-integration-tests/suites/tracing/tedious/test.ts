import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('tedious auto instrumentation', { timeout: 90_000 }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const dbSpan = (overrides: Record<string, unknown>) =>
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.otel.tedious',
      data: expect.objectContaining({
        'sentry.origin': 'auto.db.otel.tedious',
        'sentry.op': 'db',
        'db.system': 'mssql',
        'db.name': 'master',
        'db.user': 'sa',
        'net.peer.name': '127.0.0.1',
        'net.peer.port': 1433,
      }),
      ...overrides,
    });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      dbSpan({ description: 'SELECT 1 + 1 AS solution', status: 'ok' }),
      dbSpan({ description: 'SELECT 42; SELECT 42;', status: 'ok' }),
      dbSpan({ description: 'select !', status: 'internal_error' }),
      dbSpan({ description: '[dbo].[test_proced]', status: 'ok' }),
      dbSpan({ description: 'INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)', status: 'ok' }),
      expect.objectContaining({
        description: 'execBulkLoad test_bulk master',
        op: 'db',
        origin: 'auto.db.otel.tedious',
        status: 'ok',
        data: expect.objectContaining({ 'db.sql.table': 'test_bulk' }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `tedious` package', async () => {
      await createTestRunner()
        .withDockerCompose({ workingDirectory: [__dirname] })
        .expect({ transaction: EXPECTED_TRANSACTION })
        .start()
        .completed();
    });
  });
});
