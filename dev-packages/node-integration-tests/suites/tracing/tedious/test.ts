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
      await createTestRunner()
        .expect({
          transaction: transaction => {
            expect(transaction.transaction).toBe(EXPECTED_TRANSACTION.transaction);
            expect(transaction.spans).toEqual(EXPECTED_TRANSACTION.spans);

            const CREATE_PROCEDURE =
              'CREATE OR ALTER PROCEDURE [dbo].[test_proced] @inputVal varchar(30), @outputCount int OUTPUT AS set @outputCount = LEN(@inputVal);';
            const CREATE_PREPARED_TABLE =
              "if object_id('[dbo].[test_prepared]') is null CREATE TABLE [dbo].[test_prepared] (c1 int, c2 int)";
            const CREATE_BULK_TABLE =
              "if object_id('[dbo].[test_bulk]') is null CREATE TABLE [dbo].[test_bulk] (c1 int, c2 varchar(30))";
            const INSERT_PREPARED = 'INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)';
            const INSERT_BULK = 'insert bulk test_bulk([c1] int, [c2] nvarchar(50)) WITH (KEEP_NULLS)';
            const SELECT_PREPARED = 'SELECT c1, c2 FROM [dbo].[test_prepared]';
            const SELECT_JOIN =
              'SELECT p.c1 FROM [dbo].[test_prepared] p INNER JOIN [dbo].[test_bulk] b ON p.c1 = b.c1';
            const SELECT_INLINE_LITERAL = 'SELECT c1, c2 FROM [dbo].[test_prepared] WHERE c1 = 42';
            const SELECT_PARAMETERIZED = 'SELECT c1, c2 FROM [dbo].[test_prepared] WHERE c1 = @c1';
            const SELECT_STRING_LITERAL = "SELECT c1, c2 FROM [dbo].[test_bulk] WHERE c2 = 'hello from acme'";

            expect(
              (transaction.spans ?? [])
                .filter(span => span.origin === ORIGIN)
                .map(span => ({ name: span.description, text: span.data?.['db.query.text'] })),
            ).toEqual([
              { name: 'SELECT 1 + 1 AS solution', text: 'SELECT 1 + 1 AS solution' },
              { name: 'SELECT 42; SELECT 42;', text: 'SELECT 42; SELECT 42;' },
              { name: 'select !', text: 'select !' },
              { name: CREATE_PROCEDURE, text: CREATE_PROCEDURE },
              { name: '[dbo].[test_proced]', text: '[dbo].[test_proced]' },
              { name: CREATE_PREPARED_TABLE, text: CREATE_PREPARED_TABLE },
              { name: INSERT_PREPARED, text: INSERT_PREPARED },
              { name: INSERT_PREPARED, text: INSERT_PREPARED },
              { name: CREATE_BULK_TABLE, text: CREATE_BULK_TABLE },
              { name: 'execBulkLoad test_bulk master', text: undefined },
              { name: INSERT_BULK, text: INSERT_BULK },
              { name: SELECT_PREPARED, text: SELECT_PREPARED },
              { name: SELECT_JOIN, text: SELECT_JOIN },
              { name: SELECT_INLINE_LITERAL, text: SELECT_INLINE_LITERAL },
              { name: SELECT_PARAMETERIZED, text: SELECT_PARAMETERIZED },
              { name: SELECT_STRING_LITERAL, text: SELECT_STRING_LITERAL },
            ]);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-span-streaming.mjs', (createTestRunner, test) => {
    test('should name spans after the query summary with span streaming', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const dbSpans = container.items.filter(item => item.attributes['sentry.origin']?.value === ORIGIN);

            expect(
              dbSpans.map(span => ({
                name: span.name,
                summary: span.attributes['db.query.summary']?.value,
                text: span.attributes['db.query.text']?.value,
              })),
            ).toEqual([
              { name: 'SELECT', summary: 'SELECT', text: 'SELECT 1 + 1 AS solution' },
              { name: 'SELECT', summary: 'SELECT', text: 'SELECT 42; SELECT 42;' },
              { name: 'select', summary: 'select', text: 'select !' },
              {
                name: 'CREATE',
                summary: 'CREATE',
                text: 'CREATE OR ALTER PROCEDURE [dbo].[test_proced] @inputVal varchar(30), @outputCount int OUTPUT AS set @outputCount = LEN(@inputVal);',
              },
              { name: 'callProcedure [dbo].[test_proced]', summary: undefined, text: '[dbo].[test_proced]' },
              {
                name: 'if',
                summary: 'if',
                text: "if object_id('[dbo].[test_prepared]') is null CREATE TABLE [dbo].[test_prepared] (c1 int, c2 int)",
              },
              {
                name: 'INSERT [dbo].[test_prepared]',
                summary: 'INSERT [dbo].[test_prepared]',
                text: 'INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)',
              },
              {
                name: 'INSERT [dbo].[test_prepared]',
                summary: 'INSERT [dbo].[test_prepared]',
                text: 'INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)',
              },
              {
                name: 'if',
                summary: 'if',
                text: "if object_id('[dbo].[test_bulk]') is null CREATE TABLE [dbo].[test_bulk] (c1 int, c2 varchar(30))",
              },
              {
                name: 'insert',
                summary: 'insert',
                text: 'insert bulk test_bulk([c1] int, [c2] nvarchar(50)) WITH (KEEP_NULLS)',
              },
              { name: 'execBulkLoad test_bulk', summary: undefined, text: undefined },
              {
                name: 'SELECT [dbo].[test_prepared]',
                summary: 'SELECT [dbo].[test_prepared]',
                text: 'SELECT c1, c2 FROM [dbo].[test_prepared]',
              },
              {
                name: 'SELECT [dbo].[test_prepared]',
                summary: 'SELECT [dbo].[test_prepared]',
                text: 'SELECT c1, c2 FROM [dbo].[test_prepared] WHERE c1 = @c1',
              },
              {
                // TODO: (check if correct) Both sides of the join survive into the summary.
                name: 'SELECT [dbo].[test_prepared] [dbo].[test_bulk]',
                summary: 'SELECT [dbo].[test_prepared] [dbo].[test_bulk]',
                text: 'SELECT p.c1 FROM [dbo].[test_prepared] p INNER JOIN [dbo].[test_bulk] b ON p.c1 = b.c1',
              },
              {
                // TODO: (fix) tedious reports the statement as the caller wrote it, so an inlined literal reaches
                // `db.query.text` unsanitized. Only the summary is sanitized.
                name: 'SELECT [dbo].[test_prepared]',
                summary: 'SELECT [dbo].[test_prepared]',
                text: 'SELECT c1, c2 FROM [dbo].[test_prepared] WHERE c1 = 42',
              },
              {
                // TODO: (fix) The `from` inside the string literal must not be read as a table: the statement is
                // sanitized before it is summarized, so the summary is just the real table.
                name: 'SELECT [dbo].[test_bulk]',
                summary: 'SELECT [dbo].[test_bulk]',
                text: "SELECT c1, c2 FROM [dbo].[test_bulk] WHERE c2 = 'hello from acme'",
              },
            ]);
          },
        })
        .start()
        .completed();
    });
  });
});
