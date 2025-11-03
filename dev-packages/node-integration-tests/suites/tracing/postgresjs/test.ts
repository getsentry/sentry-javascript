import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

const EXISTING_TEST_EMAIL = 'bar@baz.com';
const NON_EXISTING_TEST_EMAIL = 'foo@baz.com';

describe('postgresjs auto instrumentation', () => {
  test('should auto-instrument `postgres` package', { timeout: 60_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'CREATE TABLE',
            'db.query.text':
              'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.otel.postgres',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text':
              "select b.oid, b.typarray from pg_catalog.pg_type a left join pg_catalog.pg_type b on b.oid = a.typelem where a.typcategory = 'A' group by b.oid, b.typarray order by b.oid",
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.otel.postgres',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            "select b.oid, b.typarray from pg_catalog.pg_type a left join pg_catalog.pg_type b on b.oid = a.typelem where a.typcategory = 'A' group by b.oid, b.typarray order by b.oid",
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'INSERT',
            'db.query.text': `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'UPDATE',
            'db.query.text': `UPDATE "User" SET "name" = 'Foo' WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.otel.postgres',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `UPDATE "User" SET "name" = 'Foo' WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.otel.postgres',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': 'SELECT * from generate_series(?,?) as x',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.otel.postgres',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * from generate_series(?,?) as x',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'DROP TABLE',
            'db.query.text': 'DROP TABLE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.otel.postgres',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DROP TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            // No db.operation.name here, as this is an errored span
            'db.response.status_code': '42P01',
            'error.type': 'PostgresError',
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${NON_EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.otel.postgres',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${NON_EXISTING_TEST_EMAIL}'`,
          op: 'db',
          status: 'internal_error',
          origin: 'auto.db.otel.postgres',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
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
                  module: 'postgres.cjs.src:connection',
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

    await createRunner(__dirname, 'scenario.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start()
      .completed();
  });
});
