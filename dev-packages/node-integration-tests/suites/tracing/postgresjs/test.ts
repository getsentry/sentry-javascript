import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('postgresjs auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should auto-instrument `postgres` package (CJS)', { timeout: 60_000 }, async () => {
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
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
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
            'sentry.origin': 'auto.db.postgresjs',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'UPDATE "User" SET "name" = ? WHERE "email" = ?',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = $1 AND "name" = $2',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * from generate_series(?,?) as x',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
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

  test('should auto-instrument `postgres` package (ESM)', { timeout: 60_000 }, async () => {
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
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
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
            'sentry.origin': 'auto.db.postgresjs',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'UPDATE "User" SET "name" = ? WHERE "email" = ?',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = $1 AND "name" = $2',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * from generate_series(?,?) as x',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
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
                  module: 'postgres.src:connection',
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

    await createRunner(__dirname, 'scenario.mjs')
      .withFlags('--import', `${__dirname}/instrument.mjs`)
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .expect({ event: EXPECTED_ERROR_EVENT })
      .start()
      .completed();
  });

  test('should call requestHook when provided (CJS)', { timeout: 60_000 }, async () => {
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
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
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
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
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
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
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

    await createRunner(__dirname, 'scenario-requestHook.js')
      .withFlags('--require', `${__dirname}/instrument-requestHook.cjs`)
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should call requestHook when provided (ESM)', { timeout: 60_000 }, async () => {
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
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
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
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
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
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
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

    await createRunner(__dirname, 'scenario-requestHook.mjs')
      .withFlags('--import', `${__dirname}/instrument-requestHook.mjs`)
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  // Tests for URL-based initialization pattern (regression prevention)
  test('should instrument postgres package with URL initialization (CJS)', { timeout: 90_000 }, async () => {
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
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'UPDATE',
            'db.query.text': 'UPDATE "User" SET "name" = ? WHERE "email" = ?',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'UPDATE "User" SET "name" = ? WHERE "email" = ?',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
      ]),
    };

    await createRunner(__dirname, 'scenario-url.cjs')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should instrument postgres package with URL initialization (ESM)', { timeout: 90_000 }, async () => {
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
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description:
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES (?, ?)',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = ?',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'DELETE FROM "User" WHERE "email" = ?',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
      ]),
    };

    await createRunner(__dirname, 'scenario-url.mjs')
      .withFlags('--import', `${__dirname}/instrument.mjs`)
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should instrument sql.unsafe() queries (CJS)', { timeout: 90_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'CREATE TABLE',
            'db.query.text': 'CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        // sql.unsafe() with $1 placeholders - preserved per OTEL spec
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'INSERT',
            'db.query.text': 'INSERT INTO "User" ("email") VALUES ($1)',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email") VALUES ($1)',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = $1',
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

    await createRunner(__dirname, 'scenario-unsafe.cjs')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should instrument sql.unsafe() queries (ESM)', { timeout: 90_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'CREATE TABLE',
            'db.query.text': 'CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        // sql.unsafe() with $1 placeholders - preserved per OTEL spec
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'INSERT',
            'db.query.text': 'INSERT INTO "User" ("email") VALUES ($1)',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'INSERT INTO "User" ("email") VALUES ($1)',
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
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: 'SELECT * FROM "User" WHERE "email" = $1',
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

    await createRunner(__dirname, 'scenario-unsafe.mjs')
      .withFlags('--import', `${__dirname}/instrument.mjs`)
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port 5432'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });
});
