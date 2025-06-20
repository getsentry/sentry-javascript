import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

describe('postgresjs auto instrumentation', () => {
  test('should auto-instrument `postgres` package', { timeout: 60_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.operation.name': 'CREATE TABLE',
            'db.query.text':
              'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'CREATE TABLE db:test_db',
          op: 'db',
          status: 'ok',
          origin: 'manual',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.operation.name': 'SELECT',
            'db.query.text':
              "select b.oid, b.typarray from pg_catalog.pg_type a left join pg_catalog.pg_type b on b.oid = a.typelem where a.typcategory = 'A' group by b.oid, b.typarray order by b.oid",
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT db:test_db',
          op: 'db',
          status: 'ok',
          origin: 'manual',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.operation.name': 'INSERT',
            'db.query.text': 'INSERT INTO "User" ("email", "name") VALUES (\'Foo\', \'bar@baz.com\')',
            'db.system.name': 'postgres',
            'sentry.origin': 'manual',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT db:test_db',
          op: 'db',
          status: 'ok',
          origin: 'manual',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.operation.name': 'UPDATE',
            'db.query.text': 'UPDATE "User" SET "name" = \'Foo\' WHERE "email" = \'bar@baz.com\'',
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'UPDATE db:test_db',
          op: 'db',
          status: 'ok',
          origin: 'manual',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.operation.name': 'SELECT',
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = \'bar@baz.com\'',
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT db:test_db',
          op: 'db',
          status: 'ok',
          origin: 'manual',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.operation.name': 'SELECT',
            'db.query.text': 'SELECT * from generate_series(?,?) as x',
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT db:test_db',
          op: 'db',
          status: 'ok',
          origin: 'manual',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.operation.name': 'DROP TABLE',
            'db.query.text': 'DROP TABLE "User"',
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DROP TABLE db:test_db',
          op: 'db',
          status: 'ok',
          origin: 'manual',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = \'foo@baz.com\'',
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          // This span is an error span and the `command` is not available when a does not resolve
          // That's why we can't update the span description when the query fails
          description: 'postgresjs.query',
          op: 'db',
          status: 'unknown_error',
          origin: 'manual',
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
