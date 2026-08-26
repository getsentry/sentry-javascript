import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('tedious auto instrumentation', { workingDirectory: [__dirname] }, () => {
  const ORIGIN = 'auto.db.tedious';

  afterAll(() => {
    cleanupChildProcesses();
  });

  const dbSpan = (overrides: Record<string, unknown>) =>
    expect.objectContaining({
      op: 'db',
      origin: ORIGIN,
      data: expect.objectContaining({
        'sentry.origin': ORIGIN,
        'sentry.op': 'db',
        'db.system.name': 'mssql',
        'db.namespace': 'master',
        'db.user': 'sa',
        'server.address': '127.0.0.1',
        'server.port': 1433,
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
        origin: ORIGIN,
        status: 'ok',
        data: expect.objectContaining({ 'db.sql.table': 'test_bulk' }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `tedious` package', async () => {
      await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-span-streaming.mjs', (createTestRunner, test) => {
    test('should name spans after the operation with span streaming', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const dbSpans = container.items.filter(item => item.attributes['sentry.origin']?.value === ORIGIN);

            // The SQL statement stays on `db.query.text`, but never reaches the span name.
            expect(dbSpans.map(span => ({ name: span.name, text: span.attributes['db.query.text']?.value }))).toEqual([
              { name: 'execSql master', text: 'SELECT 1 + 1 AS solution' },
              { name: 'execSqlBatch master', text: 'SELECT 42; SELECT 42;' },
              { name: 'execSql master', text: 'select !' },
              {
                name: 'execSql master',
                text: 'CREATE OR ALTER PROCEDURE [dbo].[test_proced] @inputVal varchar(30), @outputCount int OUTPUT AS set @outputCount = LEN(@inputVal);',
              },
              { name: 'callProcedure [dbo].[test_proced] master', text: '[dbo].[test_proced]' },
              {
                name: 'execSql master',
                text: "if object_id('[dbo].[test_prepared]') is null CREATE TABLE [dbo].[test_prepared] (c1 int, c2 int)",
              },
              { name: 'prepare master', text: 'INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)' },
              { name: 'execute master', text: 'INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)' },
              {
                name: 'execSql master',
                text: "if object_id('[dbo].[test_bulk]') is null CREATE TABLE [dbo].[test_bulk] (c1 int, c2 varchar(30))",
              },
              {
                name: 'execSqlBatch master',
                text: 'insert bulk test_bulk([c1] int, [c2] nvarchar(50)) WITH (KEEP_NULLS)',
              },
              { name: 'execBulkLoad test_bulk master', text: undefined },
            ]);
          },
        })
        .start()
        .completed();
    });
  });
});
