import {
  DB_NAMESPACE,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('tedious auto instrumentation', { workingDirectory: [__dirname] }, () => {
  const ORIGIN = 'auto.db.tedious';

  afterAll(() => {
    cleanupChildProcesses();
  });

  const dbSpan = (text: string, status = 'ok') =>
    expect.objectContaining({
      status,
      attributes: expect.objectContaining({
        [DB_QUERY_TEXT]: { type: 'string', value: text },
        [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
        [SENTRY_OP]: { type: 'string', value: 'db' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'mssql' },
        [DB_NAMESPACE]: { type: 'string', value: 'master' },
        [DB_USER]: { type: 'string', value: 'sa' },
        [SERVER_ADDRESS]: { type: 'string', value: '127.0.0.1' },
        [SERVER_PORT]: { type: 'integer', value: 1433 },
      }),
    });

  const EXPECTED_SPANS = {
    items: expect.arrayContaining([
      dbSpan('SELECT ? + ? AS solution'),
      dbSpan('SELECT ?; SELECT ?'),
      dbSpan('select !', 'error'),
      dbSpan('[dbo].[test_proced]'),
      dbSpan('INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)'),
      expect.objectContaining({
        name: 'execBulkLoad test_bulk',
        status: 'ok',
        attributes: expect.objectContaining({
          'db.sql.table': { type: 'string', value: 'test_bulk' },
          [SENTRY_OP]: { type: 'string', value: 'db' },
          [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `tedious` package', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('Test Transaction');
            expect(container.items).toEqual(EXPECTED_SPANS.items);

            const CREATE_PROCEDURE =
              'CREATE OR ALTER PROCEDURE [dbo].[test_proced] @inputVal varchar(?), @outputCount int OUTPUT AS set @outputCount = LEN(@inputVal)';
            const CREATE_PREPARED_TABLE = 'if object_id(?) is null CREATE TABLE [dbo].[test_prepared] (c1 int, c2 int)';
            const CREATE_BULK_TABLE = 'if object_id(?) is null CREATE TABLE [dbo].[test_bulk] (c1 int, c2 varchar(?))';
            const INSERT_PREPARED = 'INSERT INTO [dbo].[test_prepared] VALUES (@val1, @val2)';
            const INSERT_BULK = 'insert bulk test_bulk([c1] int, [c2] nvarchar(?)) WITH (KEEP_NULLS)';
            const SELECT_PREPARED = 'SELECT c1, c2 FROM [dbo].[test_prepared]';
            const SELECT_JOIN =
              'SELECT p.c1 FROM [dbo].[test_prepared] p INNER JOIN [dbo].[test_bulk] b ON p.c1 = b.c1';
            const SELECT_INLINE_LITERAL = 'SELECT c1, c2 FROM [dbo].[test_prepared] WHERE c1 = ?';
            const SELECT_PARAMETERIZED = 'SELECT c1, c2 FROM [dbo].[test_prepared] WHERE c1 = @c1';
            const SELECT_STRING_LITERAL = 'SELECT c1, c2 FROM [dbo].[test_bulk] WHERE c2 = ?';

            expect(
              container.items
                .filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN)
                .map(span => ({
                  name: span.name,
                  summary: span.attributes[DB_QUERY_SUMMARY]?.value,
                  text: span.attributes[DB_QUERY_TEXT]?.value,
                })),
            ).toEqual([
              { name: 'SELECT', summary: 'SELECT', text: 'SELECT ? + ? AS solution' },
              { name: 'SELECT', summary: 'SELECT', text: 'SELECT ?; SELECT ?' },
              { name: 'select', summary: 'select', text: 'select !' },
              { name: 'CREATE', summary: 'CREATE', text: CREATE_PROCEDURE },
              { name: 'callProcedure [dbo].[test_proced]', summary: undefined, text: '[dbo].[test_proced]' },
              { name: 'if', summary: 'if', text: CREATE_PREPARED_TABLE },
              { name: 'INSERT [dbo].[test_prepared]', summary: 'INSERT [dbo].[test_prepared]', text: INSERT_PREPARED },
              { name: 'INSERT [dbo].[test_prepared]', summary: 'INSERT [dbo].[test_prepared]', text: INSERT_PREPARED },
              { name: 'if', summary: 'if', text: CREATE_BULK_TABLE },
              { name: 'insert', summary: 'insert', text: INSERT_BULK },
              { name: 'execBulkLoad test_bulk', summary: undefined, text: undefined },
              { name: 'SELECT [dbo].[test_prepared]', summary: 'SELECT [dbo].[test_prepared]', text: SELECT_PREPARED },
              {
                // TODO: (check if correct) Both sides of the join survive into the summary.
                name: 'SELECT [dbo].[test_prepared] [dbo].[test_bulk]',
                summary: 'SELECT [dbo].[test_prepared] [dbo].[test_bulk]',
                text: SELECT_JOIN,
              },
              {
                name: 'SELECT [dbo].[test_prepared]',
                summary: 'SELECT [dbo].[test_prepared]',
                text: SELECT_INLINE_LITERAL,
              },
              {
                name: 'SELECT [dbo].[test_prepared]',
                summary: 'SELECT [dbo].[test_prepared]',
                text: SELECT_PARAMETERIZED,
              },
              { name: 'SELECT [dbo].[test_bulk]', summary: 'SELECT [dbo].[test_bulk]', text: SELECT_STRING_LITERAL },
            ]);
          },
        })
        .start()
        .completed();
    });
  });

  // tedious 20 requires Node >= 22.
  conditionalTest({ min: 22 })('tedious v20', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `tedious` package', async () => {
          await createTestRunner()
            .expect({
              span: container => {
                const dbSpans = container.items.filter(item => item.attributes[SENTRY_ORIGIN]?.value === ORIGIN);

                expect(dbSpans.map(span => span.name)).toEqual(
                  expect.arrayContaining([
                    'SELECT',
                    'callProcedure [dbo].[test_proced]',
                    'INSERT [dbo].[test_prepared]',
                    'execBulkLoad test_bulk',
                    'SELECT [dbo].[test_bulk]',
                  ]),
                );
                expect(dbSpans.find(span => span.name === 'select')?.status).toBe('error');
                expect(dbSpans[0]?.attributes).toMatchObject({
                  [DB_SYSTEM_NAME]: { value: 'mssql' },
                  [DB_NAMESPACE]: { value: 'master' },
                  [DB_USER]: { value: 'sa' },
                  [SERVER_ADDRESS]: { value: '127.0.0.1' },
                  [SERVER_PORT]: { value: 1433 },
                });
              },
            })
            .start()
            .completed();
        });
      },
      { additionalDependencies: { tedious: '^20' } },
    );
  });
});
