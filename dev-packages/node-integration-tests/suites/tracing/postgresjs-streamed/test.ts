import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

/**
 * Streamed span attributes are `{ value, type }` objects, unlike transaction span `data`,
 * which stores values directly.
 */
function attr(value: unknown): unknown {
  return expect.objectContaining({ value });
}

/**
 * The attributes every query span carries, regardless of the statement.
 */
const COMMON_DB_ATTRIBUTES = {
  'db.namespace': attr('test_db'),
  'db.system.name': attr('postgres'),
  'sentry.op': attr('db'),
  'sentry.origin': attr('auto.db.postgresjs'),
  'server.address': attr('localhost'),
  'server.port': attr(5446),
};

/**
 * Builds the expectation for one streamed query span.
 *
 * `name` is asserted separately from `db.query.summary` even though the two always match: the point
 * of this suite is that the span name is the summary and never the statement, so both sides of that
 * equality have to be pinned. `statement` is the sanitized `db.query.text`, which does keep the full
 * (parameterized) SQL.
 */
function expectedQuerySpan({
  name,
  statement,
  operation,
  extraAttributes = {},
}: {
  name: string;
  statement: string;
  operation: string;
  extraAttributes?: Record<string, unknown>;
}): unknown {
  return expect.objectContaining({
    name,
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      ...COMMON_DB_ATTRIBUTES,
      'db.operation.name': attr(operation),
      'db.query.text': attr(statement),
      'db.query.summary': attr(name),
      ...extraAttributes,
    }),
  });
}

const CREATE_USER_TABLE_STATEMENT =
  'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))';

function getDbSpans(container: SerializedStreamedSpanContainer): SerializedStreamedSpanContainer['items'] {
  return container.items.filter(item => item.attributes['sentry.op']?.value === 'db');
}

describeWithDockerCompose('postgresjs auto instrumentation (streamed)', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('basic', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        expectedQuerySpan({
          name: 'CREATE TABLE "User"',
          statement: CREATE_USER_TABLE_STATEMENT,
          operation: 'CREATE TABLE',
        }),
        expectedQuerySpan({
          name: 'INSERT "User"',
          statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?)',
          operation: 'INSERT',
        }),
        expectedQuerySpan({
          name: 'UPDATE "User"',
          statement: 'UPDATE "User" SET "name" = ? WHERE "email" = $1',
          operation: 'UPDATE',
        }),
        expectedQuerySpan({
          name: 'SELECT "User"',
          statement: 'SELECT * FROM "User" WHERE "email" = $1',
          operation: 'SELECT',
        }),
        // Parameterized query test - verifies that tagged template queries with interpolations
        // are properly reconstructed with $1, $2 placeholders which are PRESERVED per OTEL spec
        // (PostgreSQL $n placeholders indicate parameterized queries that don't leak sensitive data)
        expectedQuerySpan({
          name: 'SELECT "User"',
          statement: 'SELECT * FROM "User" WHERE "email" = $1 AND "name" = $2',
          operation: 'SELECT',
        }),
        expectedQuerySpan({
          name: 'DELETE "User"',
          statement: 'DELETE FROM "User" WHERE "email" = $1',
          operation: 'DELETE',
        }),
        expectedQuerySpan({
          name: 'INSERT "User"',
          statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?) RETURNING *',
          operation: 'INSERT',
        }),
        // The cursor query summarizes to the set-returning function it selects from.
        expectedQuerySpan({
          name: 'SELECT generate_series',
          statement: 'SELECT * from generate_series(?,?) as x',
          operation: 'SELECT',
        }),
        expectedQuerySpan({
          name: 'DROP TABLE "User"',
          statement: 'DROP TABLE "User"',
          operation: 'DROP TABLE',
        }),
        // The table is gone by now, so this one fails.
        expect.objectContaining({
          name: 'SELECT "User"',
          is_segment: false,
          status: 'error',
          attributes: expect.objectContaining({
            ...COMMON_DB_ATTRIBUTES,
            'db.operation.name': attr('SELECT'),
            'db.query.text': attr('SELECT * FROM "User" WHERE "email" = $1'),
            'db.query.summary': attr('SELECT "User"'),
            'db.response.status_code': attr('42P01'),
            'error.type': attr('PostgresError'),
            'sentry.status.message': attr('relation "User" does not exist'),
          }),
        }),
      ]),
    };

    const EXPECTED_ERROR_EVENT = {
      event_id: expect.any(String),
      contexts: {
        trace: {
          trace_id: expect.any(String),
          span_id: expect.any(String),
        },
      },
      exception: {
        values: [
          {
            type: 'PostgresError',
            value: 'relation "User" does not exist',
            stacktrace: expect.objectContaining({
              frames: expect.arrayContaining([
                expect.objectContaining({
                  function: 'handle',
                  // Module differs between CJS (`postgres.cjs.src:connection`) and ESM (`postgres.src:connection`)
                  module: expect.stringMatching(/^postgres(\.cjs)?\.src:connection$/),
                  filename: expect.any(String),
                  lineno: expect.any(Number),
                  colno: expect.any(Number),
                }),
              ]),
            }),
          },
        ],
      },
    };

    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `postgres` package', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .expect({
            span: container => {
              expect(container).toMatchObject(EXPECTED_SPANS);

              // The assertions above only cover the queries the scenario issues itself. postgres.js
              // also runs internal ones (e.g. the `pg_catalog` type lookup), so guard the invariant
              // across every query span: the name is the summary, never the statement.
              const dbSpans = getDbSpans(container);
              expect(dbSpans.length).toBeGreaterThan(0);
              for (const span of dbSpans) {
                expect(span.name).toBe(span.attributes['db.query.summary']?.value);
              }
            },
          })
          .expect({ event: EXPECTED_ERROR_EVENT })
          // The error event is captured via an unhandled rejection processed on a later tick than
          // the spans, so the two envelopes can reach the transport in either order.
          .unordered()
          .start()
          .completed();
      });
    });
  });

  describe('requestHook', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining(
        [
          { name: 'CREATE TABLE "User"', statement: CREATE_USER_TABLE_STATEMENT, operation: 'CREATE TABLE' },
          {
            name: 'INSERT "User"',
            statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?)',
            operation: 'INSERT',
          },
          { name: 'SELECT "User"', statement: 'SELECT * FROM "User" WHERE "email" = $1', operation: 'SELECT' },
          { name: 'DROP TABLE "User"', statement: 'DROP TABLE "User"', operation: 'DROP TABLE' },
        ].map(({ name, statement, operation }) =>
          expectedQuerySpan({
            name,
            statement,
            operation,
            extraAttributes: {
              'custom.requestHook': attr('called'),
              'custom.requestHook.query': attr(statement),
              'custom.requestHook.database': attr('test_db'),
              'custom.requestHook.host': attr('localhost'),
              'custom.requestHook.port': attr('5446'),
            },
          }),
        ),
      ),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-requestHook.mjs',
      'instrument-requestHook.mjs',
      (createTestRunner, test) => {
        test('should call requestHook when provided', { timeout: 90_000 }, async () => {
          await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
        });
      },
    );
  });

  describe('url initialization', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expectedQuerySpan({
          name: 'CREATE TABLE "User"',
          statement: CREATE_USER_TABLE_STATEMENT,
          operation: 'CREATE TABLE',
        }),
        expectedQuerySpan({
          name: 'INSERT "User"',
          statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, ?)',
          operation: 'INSERT',
        }),
        expectedQuerySpan({
          name: 'SELECT "User"',
          statement: 'SELECT * FROM "User" WHERE "email" = $1',
          operation: 'SELECT',
        }),
        expectedQuerySpan({
          name: 'DELETE "User"',
          statement: 'DELETE FROM "User" WHERE "email" = $1',
          operation: 'DELETE',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-url.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should instrument postgres package with URL initialization', { timeout: 90_000 }, async () => {
        await createTestRunner().ignore('event').expect({ span: EXPECTED_SPANS }).start().completed();
      });
    });
  });

  describe('sql.unsafe()', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expectedQuerySpan({
          name: 'CREATE TABLE "User"',
          statement: 'CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))',
          operation: 'CREATE TABLE',
        }),
        // sql.unsafe() with $1 placeholders - preserved per OTEL spec
        expectedQuerySpan({
          name: 'INSERT "User"',
          statement: 'INSERT INTO "User" ("email") VALUES ($1)',
          operation: 'INSERT',
        }),
        expectedQuerySpan({
          name: 'SELECT "User"',
          statement: 'SELECT * FROM "User" WHERE "email" = $1',
          operation: 'SELECT',
        }),
        expectedQuerySpan({
          name: 'DROP TABLE "User"',
          statement: 'DROP TABLE "User"',
          operation: 'DROP TABLE',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-unsafe.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should instrument sql.unsafe() queries', { timeout: 90_000 }, async () => {
        await createTestRunner().ignore('event').expect({ span: EXPECTED_SPANS }).start().completed();
      });
    });
  });
});
