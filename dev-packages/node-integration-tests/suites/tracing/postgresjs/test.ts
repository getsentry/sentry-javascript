import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

const EXISTING_TEST_EMAIL = 'bar@baz.com';
const NON_EXISTING_TEST_EMAIL = 'foo@baz.com';

// Helper function to create basic span matcher (reduces duplication in new tests)
function createDbSpanMatcher(operationName: string, descriptionMatcher: unknown = expect.any(String)) {
  return expect.objectContaining({
    data: expect.objectContaining({
      'db.namespace': 'test_db',
      'db.system.name': 'postgres',
      'db.operation.name': operationName,
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.postgresjs',
      'server.address': 'localhost',
      'server.port': 5444,
    }),
    description: descriptionMatcher,
    op: 'db',
    origin: 'auto.db.postgresjs',
  });
}

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
            'db.query.text': `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
            'sentry.origin': 'auto.db.postgresjs',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
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
            'db.query.text': `UPDATE "User" SET "name" = 'Foo' WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `UPDATE "User" SET "name" = 'Foo' WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
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
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
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
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${NON_EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${NON_EXISTING_TEST_EMAIL}'`,
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
            'db.query.text': `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
            'sentry.origin': 'auto.db.postgresjs',
            'sentry.op': 'db',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
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
            'db.query.text': `UPDATE "User" SET "name" = 'Foo' WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `UPDATE "User" SET "name" = 'Foo' WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
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
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
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
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${NON_EXISTING_TEST_EMAIL}'`,
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${NON_EXISTING_TEST_EMAIL}'`,
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
            'db.query.text': `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
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
            'db.query.text': `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `INSERT INTO "User" ("email", "name") VALUES ('Foo', '${EXISTING_TEST_EMAIL}')`,
          op: 'db',
          status: 'ok',
          origin: 'auto.db.postgresjs',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.namespace': 'test_db',
            'db.system.name': 'postgres',
            'db.operation.name': 'SELECT',
            'db.query.text': `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
            'custom.requestHook': 'called',
            'sentry.op': 'db',
            'sentry.origin': 'auto.db.postgresjs',
            'server.address': 'localhost',
            'server.port': 5444,
          }),
          description: `SELECT * FROM "User" WHERE "email" = '${EXISTING_TEST_EMAIL}'`,
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
        createDbSpanMatcher('CREATE TABLE'),
        createDbSpanMatcher('INSERT'),
        createDbSpanMatcher('UPDATE'),
        createDbSpanMatcher('SELECT'),
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
        createDbSpanMatcher('CREATE TABLE'),
        createDbSpanMatcher('INSERT'),
        createDbSpanMatcher('SELECT'),
        createDbSpanMatcher('DELETE'),
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
        createDbSpanMatcher('CREATE TABLE'),
        createDbSpanMatcher('INSERT'),
        createDbSpanMatcher('SELECT'),
        createDbSpanMatcher('DROP TABLE'),
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
        createDbSpanMatcher('CREATE TABLE'),
        createDbSpanMatcher('INSERT'),
        createDbSpanMatcher('SELECT'),
        createDbSpanMatcher('DROP TABLE'),
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
