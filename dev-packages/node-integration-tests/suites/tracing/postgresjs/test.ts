import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('postgresjs auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('basic', () => {
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
            'db.query.summary': 'CREATE TABLE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'CREATE TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
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
            'db.query.text': 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
            'db.query.summary': 'INSERT "User"',
            'sentry.origin': 'auto.db.postgresjs',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
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
            'db.query.text': 'UPDATE "User" SET "name" = ? WHERE "email" = ?',
            'db.query.summary': 'UPDATE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'UPDATE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
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
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = ?',
            'db.query.summary': 'SELECT "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        }),
        // Parameterized query test - verifies that tagged template queries with interpolations
        // are properly reconstructed with $1, $2 placeholders which are PRESERVED per OTEL spec
        // (PostgreSQL $n placeholders indicate parameterized queries that don't leak sensitive data)
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = $1 AND "name" = $2',
            'db.query.summary': 'SELECT "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
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
            'db.operation.name': 'DELETE',
            'db.query.text': 'DELETE FROM "User" WHERE "email" = ?',
            'db.query.summary': 'DELETE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DELETE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
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
            'db.query.summary': 'SELECT generate_series',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT generate_series',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
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
            'db.query.summary': 'DROP TABLE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DROP TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
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
            'db.response.status_code': '42P01',
            'error.type': 'PostgresError',
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = ?',
            'db.query.summary': 'SELECT "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT "User"',
          op: 'db',
          status: 'internal_error',
          origin: 'auto.db.postgresjs',
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

    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `postgres` package', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .withDockerCompose({ workingDirectory: [__dirname] })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .expect({ event: EXPECTED_ERROR_EVENT })
            .start()
            .completed();
        });
      },
      { copyPaths: ['wait-for-postgres.js'] },
    );
  });

  describe('requestHook', () => {
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
            'db.query.summary': 'CREATE TABLE "User"',
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'CREATE TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'INSERT',
            'db.query.text': 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
            'db.query.summary': 'INSERT "User"',
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = ?',
            'db.query.summary': 'SELECT "User"',
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'DROP TABLE',
            'db.query.text': 'DROP TABLE "User"',
            'db.query.summary': 'DROP TABLE "User"',
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DROP TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
      ]),
      extra: expect.objectContaining({
        requestHookCalled: expect.objectContaining({
          database: 'test_db',
          host: 'localhost',
          port: '5444',
          sanitizedQuery: expect.any(String),
        }),
      }),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-requestHook.mjs',
      'instrument-requestHook.mjs',
      (createTestRunner, test) => {
        test('should call requestHook when provided', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .withDockerCompose({ workingDirectory: [__dirname] })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { copyPaths: ['wait-for-postgres.js'] },
    );
  });

  describe('url initialization', () => {
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
            'db.query.summary': 'CREATE TABLE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'CREATE TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'INSERT',
            'db.query.text': 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
            'db.query.summary': 'INSERT "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = ?',
            'db.query.summary': 'SELECT "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'DELETE',
            'db.query.text': 'DELETE FROM "User" WHERE "email" = ?',
            'db.query.summary': 'DELETE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DELETE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-url.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should instrument postgres package with URL initialization', { timeout: 90_000 }, async () => {
          await createTestRunner()
            .withDockerCompose({ workingDirectory: [__dirname] })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { copyPaths: ['wait-for-postgres.js'] },
    );
  });

  describe('sql.unsafe()', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'CREATE TABLE',
            'db.query.text': 'CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))',
            'db.query.summary': 'CREATE TABLE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'CREATE TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'INSERT',
            'db.query.text': 'INSERT INTO "User" ("email") VALUES ($1)',
            'db.query.summary': 'INSERT "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': 'SELECT * FROM "User" WHERE "email" = $1',
            'db.query.summary': 'SELECT "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'DROP TABLE',
            'db.query.text': 'DROP TABLE "User"',
            'db.query.summary': 'DROP TABLE "User"',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DROP TABLE "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-unsafe.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should instrument sql.unsafe() queries', { timeout: 90_000 }, async () => {
          await createTestRunner()
            .withDockerCompose({ workingDirectory: [__dirname] })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { copyPaths: ['wait-for-postgres.js'] },
    );
  });
});
