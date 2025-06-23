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
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
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
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            "select b.oid, b.typarray from pg_catalog.pg_type a left join pg_catalog.pg_type b on b.oid = a.typelem where a.typcategory = 'A' group by b.oid, b.typarray order by b.oid",
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
            'db.system.name': 'postgres',
            'sentry.origin': 'manual',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES (\'Foo\', \'bar@baz.com\')',
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
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'UPDATE "User" SET "name" = \'Foo\' WHERE "email" = \'bar@baz.com\'',
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
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = \'bar@baz.com\'',
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
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * from generate_series(?,?) as x',
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
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DROP TABLE "User"',
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
            'db.system.name': 'postgres',
            'sentry.op': 'db',
            'sentry.origin': 'manual',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = \'foo@baz.com\'',
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
