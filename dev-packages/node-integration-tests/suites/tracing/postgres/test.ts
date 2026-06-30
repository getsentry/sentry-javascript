import { afterAll, describe, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('postgres auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('default', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'sentry.origin': 'manual',
            'sentry.op': 'db',
          }),
          description: 'pg.connect',
          op: 'db',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT * FROM "User"',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT * FROM "User"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT * FROM "User" WHERE "email" = $1',
            'db.postgresql.plan': 'select-user-by-email',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT * FROM "User" WHERE "email" = $1',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT * FROM "does_not_exist_table"',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT * FROM "does_not_exist_table"',
          op: 'db',
          status: 'internal_error',
          origin: 'auto.db.otel.postgres',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `pg` package', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({
            workingDirectory: [__dirname],
          })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  describe('ignoreConnectSpans', () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-ignoreConnect.mjs', (createTestRunner, test) => {
      test("doesn't emit connect spans if ignoreConnectSpans is true", { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({
            workingDirectory: [__dirname],
          })
          .expect({
            transaction: txn => {
              const spanNames = txn.spans?.map(span => span.description);
              expect(spanNames?.find(name => name?.includes('connect'))).toBeUndefined();
              expect(txn).toMatchObject({
                transaction: 'Test Transaction',
                spans: expect.arrayContaining([
                  expect.objectContaining({
                    data: expect.objectContaining({
                      'db.system': 'postgresql',
                      'db.name': 'tests',
                      'db.statement': 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                      'sentry.origin': 'auto.db.otel.postgres',
                      'sentry.op': 'db',
                    }),
                    description: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                    op: 'db',
                    status: 'ok',
                    origin: 'auto.db.otel.postgres',
                  }),
                  expect.objectContaining({
                    data: expect.objectContaining({
                      'db.system': 'postgresql',
                      'db.name': 'tests',
                      'db.statement': 'SELECT * FROM "User"',
                      'sentry.origin': 'auto.db.otel.postgres',
                      'sentry.op': 'db',
                    }),
                    description: 'SELECT * FROM "User"',
                    op: 'db',
                    status: 'ok',
                    origin: 'auto.db.otel.postgres',
                  }),
                ]),
              });
            },
          })
          .start()
          .completed();
      });
    });
  });

  describe('pool', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        // Pool connect span: no origin is set on connect spans, so it defaults
        // to 'manual', and the connection-string credentials are masked out.
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.connection_string': 'postgresql://localhost:5494/tests',
            'sentry.op': 'db',
          }),
          description: 'pg-pool.connect',
          op: 'db',
          status: 'ok',
          origin: 'manual',
        }),
        // Callback-style query (no awaited promise returned to the caller).
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT 1 AS foo',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT 1 AS foo',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-pool.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test(
        'auto-instruments `pg.Pool`, masks connection-string credentials, and handles callback-style queries',
        { timeout: 90_000 },
        async () => {
          await createTestRunner()
            .withDockerCompose({
              workingDirectory: [__dirname],
            })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        },
      );
    });
  });

  describe('connect error', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'sentry.op': 'db',
          }),
          description: 'pg.connect',
          op: 'db',
          status: 'internal_error',
          origin: 'manual',
        }),
      ]),
    };

    // No DB needed: the scenario connects to a port where nothing is listening.
    createEsmAndCjsTests(__dirname, 'scenario-connect-error.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('records an errored connect span when the connection fails', { timeout: 90_000 }, async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    });
  });

  // A query chained off `connect()` with `.then()` (rather than awaited) must still
  // be parented to the active transaction. Since the instrumentation requires a
  // parent span, the query only produces a span if the trace context survives the
  // connect promise's continuation.
  describe('connect promise continuation', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT 1 AS connect_then',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT 1 AS connect_then',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-connect-then.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('parents a query chained off connect() to the active transaction', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({
            workingDirectory: [__dirname],
          })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  describe('requireParentSpan', () => {
    createEsmAndCjsTests(__dirname, 'scenario-no-parent.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('does not instrument queries or connects without an active parent span', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({
            workingDirectory: [__dirname],
          })
          .expect({
            transaction: txn => {
              const descriptions = txn.spans?.map(span => span.description) ?? [];
              // The unparented connect + query must not have produced spans
              expect(descriptions).not.toContain('SELECT 1 AS unparented');
              expect(descriptions.find(name => name?.includes('connect'))).toBeUndefined();
              // Only the parented query is instrumented
              expect(txn).toMatchObject({
                transaction: 'Test Transaction',
                spans: expect.arrayContaining([
                  expect.objectContaining({
                    data: expect.objectContaining({
                      'db.system': 'postgresql',
                      'db.name': 'tests',
                      'db.statement': 'SELECT 2 AS parented',
                      'sentry.origin': 'auto.db.otel.postgres',
                      'sentry.op': 'db',
                    }),
                    description: 'SELECT 2 AS parented',
                    op: 'db',
                    status: 'ok',
                    origin: 'auto.db.otel.postgres',
                  }),
                ]),
              });
            },
          })
          .start()
          .completed();
      });
    });
  });

  conditionalTest({ max: 25 })('pg-native', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'sentry.origin': 'manual',
            'sentry.op': 'db',
          }),
          description: 'pg.connect',
          op: 'db',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.system': 'postgresql',
            'db.name': 'tests',
            'db.statement': 'SELECT * FROM "NativeUser"',
            'sentry.origin': 'auto.db.otel.postgres',
            'sentry.op': 'db',
          }),
          description: 'SELECT * FROM "NativeUser"',
          op: 'db',
          status: 'ok',
          origin: 'auto.db.otel.postgres',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-native.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `pg-native` package', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({
            workingDirectory: [__dirname],
            setupCommand: 'yarn',
          })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });
});
