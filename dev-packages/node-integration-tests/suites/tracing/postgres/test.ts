import {
  DB_CONNECTION_STRING,
  DB_NAMESPACE,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_ENVIRONMENT,
  SENTRY_IS_LOCALHOST,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_RELEASE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { conditionalTest, EXPECTED_SDK_NAME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

const COMMON_DB_ATTRIBUTES = {
  [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: false },
  [DB_CONNECTION_STRING]: { type: 'string', value: expect.stringMatching(/^postgresql:\/\/localhost:\d+\/tests$/) },
  [DB_NAMESPACE]: { type: 'string', value: 'tests' },
  [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
  [DB_USER]: { type: 'string', value: 'test' },
  [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
  [SERVER_PORT]: { type: 'integer', value: expect.any(Number) },
  [SENTRY_KIND]: { type: 'string', value: 'client' },
  [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
  [SENTRY_OP]: { type: 'string', value: DB },
  [SENTRY_RELEASE]: { type: 'string', value: '1.0' },
  [SENTRY_SDK_NAME]: { type: 'string', value: EXPECTED_SDK_NAME },
  [SENTRY_SDK_VERSION]: { type: 'string', value: expect.any(String) },
  [SENTRY_SEGMENT_ID]: { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
  [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'Test Transaction' },
  [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
};

const COMMON_SPAN_FIELDS = {
  end_timestamp: expect.any(Number),
  is_segment: false,
  parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
  span_id: expect.stringMatching(/^[\da-f]{16}$/),
  start_timestamp: expect.any(Number),
  trace_id: expect.stringMatching(/^[\da-f]{32}$/),
};

describeWithDockerCompose('postgres auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // `postgresIntegration()` is the diagnostics-channel implementation by default, so query spans carry
  // the orchestrion origin.
  const QUERY_ORIGIN = 'auto.db.postgres';

  describe('default', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        {
          ...COMMON_SPAN_FIELDS,
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
            [SENTRY_OP]: { type: 'string', value: DB },
          },
          name: 'pg.connect',
          status: 'ok',
        },
        {
          ...COMMON_SPAN_FIELDS,
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
          },
          name: 'INSERT "User"',
          status: 'ok',
        },
        {
          ...COMMON_SPAN_FIELDS,
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User"' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
          },
          name: 'SELECT "User"',
          status: 'ok',
        },
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
            'db.postgresql.plan': { type: 'string', value: 'select-user-by-email' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
          }),
          name: 'SELECT "User"',
          status: 'ok',
        }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "does_not_exist_table"' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "does_not_exist_table"' },
          }),
          name: 'SELECT "does_not_exist_table"',
          status: 'error',
        }),
        {
          ...COMMON_SPAN_FIELDS,
          name: 'CREATE TABLE "User"',
          status: 'ok',
          attributes: {
            ...COMMON_DB_ATTRIBUTES,

            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [DB_QUERY_TEXT]: {
              type: 'string',
              value:
                'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'CREATE TABLE "User"' },
          },
        },
        {
          ...COMMON_SPAN_FIELDS,
          name: 'DROP TABLE "User"',
          status: 'ok',
          attributes: {
            ...COMMON_DB_ATTRIBUTES,

            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [DB_QUERY_TEXT]: { type: 'string', value: 'DROP TABLE "User"' },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'DROP TABLE "User"' },
          },
        },
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `pg` package', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .expect({
            span: container => {
              expect(container).toMatchObject(EXPECTED_SPANS);
              const dbSpans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === DB);
              expect(dbSpans.map(span => span.name)).toEqual([
                'pg.connect',
                'CREATE TABLE "User"',
                'INSERT "User"',
                'SELECT "User"',
                'SELECT "User"',
                'SELECT "does_not_exist_table"',
                'DROP TABLE "User"',
              ]);
            },
          })
          .start()
          .completed();
      });
    });
  });

  describe('ignoreConnectSpans', () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-ignoreConnect.mjs', (createTestRunner, test) => {
      test("doesn't emit connect spans if ignoreConnectSpans is true", { timeout: 90_000 }, async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const dbSpans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === DB);
              expect(dbSpans.map(span => span.name)).toEqual([
                'CREATE TABLE "User"',
                'INSERT "User"',
                'SELECT "User"',
                'SELECT "User"',
                'SELECT "does_not_exist_table"',
                'DROP TABLE "User"',
              ]);
              const spanNames = container.items.map(span => span.name);
              expect(spanNames?.find(name => name?.includes('connect'))).toBeUndefined();
              expect(container).toMatchObject({
                items: expect.arrayContaining([
                  expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
                  {
                    ...COMMON_SPAN_FIELDS,
                    attributes: {
                      ...COMMON_DB_ATTRIBUTES,
                      [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
                      [DB_NAMESPACE]: { type: 'string', value: 'tests' },
                      [DB_QUERY_TEXT]: {
                        type: 'string',
                        value: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                      },
                      [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
                      [SENTRY_OP]: { type: 'string', value: DB },
                      [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
                    },
                    name: 'INSERT "User"',
                    status: 'ok',
                  },
                  {
                    ...COMMON_SPAN_FIELDS,
                    attributes: {
                      ...COMMON_DB_ATTRIBUTES,
                      [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
                      [DB_NAMESPACE]: { type: 'string', value: 'tests' },
                      [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User"' },
                      [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
                      [SENTRY_OP]: { type: 'string', value: DB },
                      [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
                    },
                    name: 'SELECT "User"',
                    status: 'ok',
                  },
                  {
                    ...COMMON_SPAN_FIELDS,
                    name: 'CREATE TABLE "User"',
                    status: 'ok',
                    attributes: {
                      ...COMMON_DB_ATTRIBUTES,

                      [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
                      [DB_QUERY_TEXT]: {
                        type: 'string',
                        value:
                          'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
                      },
                      [DB_QUERY_SUMMARY]: { type: 'string', value: 'CREATE TABLE "User"' },
                    },
                  },
                  {
                    ...COMMON_SPAN_FIELDS,
                    name: 'DROP TABLE "User"',
                    status: 'ok',
                    attributes: {
                      ...COMMON_DB_ATTRIBUTES,

                      [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
                      [DB_QUERY_TEXT]: { type: 'string', value: 'DROP TABLE "User"' },
                      [DB_QUERY_SUMMARY]: { type: 'string', value: 'DROP TABLE "User"' },
                    },
                  },
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
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        // Pool connect span: no origin is set on connect spans, so it defaults
        // to 'manual', and the connection-string credentials are masked out.
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_CONNECTION_STRING]: { type: 'string', value: 'postgresql://localhost:5494/tests' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
          }),
          name: 'pg-pool.connect',
          status: 'ok',
        }),
        // Callback-style query (no awaited promise returned to the caller).
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? AS foo' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT' },
          }),
          name: 'SELECT',
          status: 'ok',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-pool.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test(
        'auto-instruments `pg.Pool`, masks connection-string credentials, and handles callback-style queries',
        { timeout: 90_000 },
        async () => {
          await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
        },
      );
    });
  });

  describe('connect error', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
          }),
          name: 'pg.connect',
          status: 'error',
        }),
      ]),
    };

    // No DB needed: the scenario connects to a port where nothing is listening.
    createEsmAndCjsTests(__dirname, 'scenario-connect-error.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('records an errored connect span when the connection fails', { timeout: 90_000 }, async () => {
        await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
      });
    });
  });

  // A query chained off `connect()` with `.then()` (rather than awaited) must still
  // be parented to the active transaction. Since the instrumentation requires a
  // parent span, the query only produces a span if the trace context survives the
  // connect promise's continuation.
  describe('connect promise continuation', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        expect.objectContaining({
          attributes: expect.objectContaining({
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? AS connect_then' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT' },
          }),
          name: 'SELECT',
          status: 'ok',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-connect-then.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('parents a query chained off connect() to the active transaction', { timeout: 90_000 }, async () => {
        await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
      });
    });
  });

  describe('requireParentSpan', () => {
    createEsmAndCjsTests(__dirname, 'scenario-no-parent.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('does not instrument queries or connects without an active parent span', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const descriptions = container.items.map(span => span.name);
              // The unparented connect + query must not have produced spans
              expect(container.items.map(span => span.attributes[DB_QUERY_TEXT]?.value)).not.toContain(
                'SELECT ? AS unparented',
              );
              expect(descriptions.find(name => name?.includes('connect'))).toBeUndefined();
              // Only the parented query is instrumented
              expect(container).toMatchObject({
                items: expect.arrayContaining([
                  expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
                  expect.objectContaining({
                    attributes: expect.objectContaining({
                      [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
                      [DB_NAMESPACE]: { type: 'string', value: 'tests' },
                      [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? AS parented' },
                      [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
                      [SENTRY_OP]: { type: 'string', value: DB },
                      [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT' },
                    }),
                    name: 'SELECT',
                    status: 'ok',
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

  // Deno: with a module load hook installed, Deno compiles a native addon (`libpq`) as JavaScript.
  // Bun: the `libpq` addon needs the Node symbol `node::EmitAsyncInit`, which Bun does not provide.
  conditionalTest({ max: 25, skipRuntimes: ['bun', 'deno'] })('pg-native', () => {
    const EXPECTED_SPANS = {
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
        {
          ...COMMON_SPAN_FIELDS,
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
            [SENTRY_OP]: { type: 'string', value: DB },
            [SERVER_ADDRESS]: { type: 'string', value: '127.0.0.1' },
            [DB_CONNECTION_STRING]: {
              type: 'string',
              value: expect.stringMatching(/^postgresql:\/\/127\.0\.0\.1:\d+\/tests$/),
            },
          },
          name: 'pg.connect',
          status: 'ok',
        },
        {
          ...COMMON_SPAN_FIELDS,
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "NativeUser"' },
            [SERVER_ADDRESS]: { type: 'string', value: '127.0.0.1' },
            [DB_CONNECTION_STRING]: {
              type: 'string',
              value: expect.stringMatching(/^postgresql:\/\/127\.0\.0\.1:\d+\/tests$/),
            },
          },
          name: 'INSERT "NativeUser"',
          status: 'ok',
        },
        {
          ...COMMON_SPAN_FIELDS,
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "NativeUser"' },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [SENTRY_OP]: { type: 'string', value: DB },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "NativeUser"' },
            [SERVER_ADDRESS]: { type: 'string', value: '127.0.0.1' },
            [DB_CONNECTION_STRING]: {
              type: 'string',
              value: expect.stringMatching(/^postgresql:\/\/127\.0\.0\.1:\d+\/tests$/),
            },
          },
          name: 'SELECT "NativeUser"',
          status: 'ok',
        },
        {
          ...COMMON_SPAN_FIELDS,
          name: 'CREATE TABLE "NativeUser"',
          status: 'ok',
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [SERVER_ADDRESS]: { type: 'string', value: '127.0.0.1' },
            [DB_CONNECTION_STRING]: {
              type: 'string',
              value: expect.stringMatching(/^postgresql:\/\/127\.0\.0\.1:\d+\/tests$/),
            },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [DB_QUERY_TEXT]: {
              type: 'string',
              value:
                'CREATE TABLE "NativeUser" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
            },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'CREATE TABLE "NativeUser"' },
          },
        },
        {
          ...COMMON_SPAN_FIELDS,
          name: 'DROP TABLE "NativeUser"',
          status: 'ok',
          attributes: {
            ...COMMON_DB_ATTRIBUTES,
            [SERVER_ADDRESS]: { type: 'string', value: '127.0.0.1' },
            [DB_CONNECTION_STRING]: {
              type: 'string',
              value: expect.stringMatching(/^postgresql:\/\/127\.0\.0\.1:\d+\/tests$/),
            },
            [SENTRY_ORIGIN]: { type: 'string', value: QUERY_ORIGIN },
            [DB_QUERY_TEXT]: { type: 'string', value: 'DROP TABLE "NativeUser"' },
            [DB_QUERY_SUMMARY]: { type: 'string', value: 'DROP TABLE "NativeUser"' },
          },
        },
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-native.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should auto-instrument `pg-native` package', { timeout: 120_000 }, async () => {
          await createTestRunner()
            .expect({
              span: container => {
                expect(container).toMatchObject(EXPECTED_SPANS);
                const dbSpans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === DB);
                expect(dbSpans.map(span => span.name)).toEqual([
                  'pg.connect',
                  'CREATE TABLE "NativeUser"',
                  'INSERT "NativeUser"',
                  'SELECT "NativeUser"',
                  'DROP TABLE "NativeUser"',
                ]);
              },
            })
            .start()
            .completed();
        });
      },
      { additionalDependencies: { 'pg-native': '3.7.0', pg: '8.20.0' } },
    );
  });

  // Orchestrion (diagnostics-channel) coverage via a dedicated instrument file. Produces the same
  // spans as the OTel path did, except the query origin reports the mechanism
  // (`auto.db.postgres`); connect/pool-connect spans stay 'manual' (those spans never set
  // an origin).
  describe('orchestrion (diagnostics-channel)', () => {
    const ORIGIN = 'auto.db.postgres';

    describe('default', () => {
      const EXPECTED_SPANS = {
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
              [SENTRY_OP]: { type: 'string', value: DB },
            }),
            name: 'pg.connect',
            status: 'ok',
          }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [DB_QUERY_TEXT]: { type: 'string', value: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: DB },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
            }),
            name: 'INSERT "User"',
            status: 'ok',
          }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User" WHERE "email" = $1' },
              'db.postgresql.plan': { type: 'string', value: 'select-user-by-email' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: DB },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
            }),
            name: 'SELECT "User"',
            status: 'ok',
          }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "does_not_exist_table"' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: DB },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "does_not_exist_table"' },
            }),
            name: 'SELECT "does_not_exist_table"',
            status: 'error',
          }),
        ]),
      };

      createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-orchestrion.mjs', (createTestRunner, test) => {
        test('auto-instruments `pg` via diagnostics channels', { timeout: 90_000 }, async () => {
          await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
        });
      });
    });

    describe('pool', () => {
      const EXPECTED_SPANS = {
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [DB_CONNECTION_STRING]: { type: 'string', value: 'postgresql://localhost:5494/tests' },
              [SENTRY_OP]: { type: 'string', value: DB },
              [SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
            }),
            name: 'pg-pool.connect',
            status: 'ok',
          }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? AS foo' },
              [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
              [SENTRY_OP]: { type: 'string', value: DB },
              [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT' },
            }),
            name: 'SELECT',
            status: 'ok',
          }),
        ]),
      };

      createEsmAndCjsTests(__dirname, 'scenario-pool.mjs', 'instrument-orchestrion.mjs', (createTestRunner, test) => {
        test('auto-instruments `pg.Pool` and handles callback-style queries', { timeout: 90_000 }, async () => {
          await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
        });
      });
    });

    describe('connect error', () => {
      const EXPECTED_SPANS = {
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
          expect.objectContaining({
            attributes: expect.objectContaining({
              [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
              [DB_NAMESPACE]: { type: 'string', value: 'tests' },
              [SENTRY_OP]: { type: 'string', value: DB },
              [SENTRY_ORIGIN]: { type: 'string', value: 'manual' },
            }),
            name: 'pg.connect',
            status: 'error',
          }),
        ]),
      };

      createEsmAndCjsTests(
        __dirname,
        'scenario-connect-error.mjs',
        'instrument-orchestrion.mjs',
        (createTestRunner, test) => {
          test('records an errored connect span when the connection fails', { timeout: 90_000 }, async () => {
            await createTestRunner().expect({ span: EXPECTED_SPANS }).start().completed();
          });
        },
      );
    });

    describe('requireParentSpan', () => {
      createEsmAndCjsTests(
        __dirname,
        'scenario-no-parent.mjs',
        'instrument-orchestrion.mjs',
        (createTestRunner, test) => {
          test(
            'does not instrument queries or connects without an active parent span',
            { timeout: 90_000 },
            async () => {
              await createTestRunner()
                .expect({
                  span: container => {
                    const descriptions = container.items.map(span => span.name);
                    expect(container.items.map(span => span.attributes[DB_QUERY_TEXT]?.value)).not.toContain(
                      'SELECT ? AS unparented',
                    );
                    expect(descriptions.find(name => name?.includes('connect'))).toBeUndefined();
                    expect(container).toMatchObject({
                      items: expect.arrayContaining([
                        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
                        expect.objectContaining({
                          attributes: expect.objectContaining({
                            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
                            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT ? AS parented' },
                            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
                            [SENTRY_OP]: { type: 'string', value: DB },
                            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT' },
                          }),
                          name: 'SELECT',
                          status: 'ok',
                        }),
                      ]),
                    });
                  },
                })
                .start()
                .completed();
            },
          );
        },
      );
    });

    describe('ignoreConnectSpans', () => {
      createEsmAndCjsTests(
        __dirname,
        'scenario.mjs',
        'instrument-orchestrion-ignoreConnect.mjs',
        (createTestRunner, test) => {
          test(
            "doesn't emit connect spans if ignoreConnectSpans is true (orchestrion)",
            { timeout: 90_000 },
            async () => {
              await createTestRunner()
                .expect({
                  span: container => {
                    const spanNames = container.items.map(span => span.name);
                    // No `pg.connect` / `pg-pool.connect` spans were produced.
                    expect(spanNames?.find(name => name?.includes('connect'))).toBeUndefined();
                    // ...but the query spans are still instrumented via orchestrion.
                    expect(container).toMatchObject({
                      items: expect.arrayContaining([
                        expect.objectContaining({ name: 'Test Transaction', is_segment: true }),
                        expect.objectContaining({
                          attributes: expect.objectContaining({
                            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
                            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
                            [DB_QUERY_TEXT]: {
                              type: 'string',
                              value: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                            },
                            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
                            [SENTRY_OP]: { type: 'string', value: DB },
                            [DB_QUERY_SUMMARY]: { type: 'string', value: 'INSERT "User"' },
                          }),
                          name: 'INSERT "User"',
                          status: 'ok',
                        }),
                        expect.objectContaining({
                          attributes: expect.objectContaining({
                            [DB_SYSTEM_NAME]: { type: 'string', value: 'postgresql' },
                            [DB_NAMESPACE]: { type: 'string', value: 'tests' },
                            [DB_QUERY_TEXT]: { type: 'string', value: 'SELECT * FROM "User"' },
                            [SENTRY_ORIGIN]: { type: 'string', value: ORIGIN },
                            [SENTRY_OP]: { type: 'string', value: DB },
                            [DB_QUERY_SUMMARY]: { type: 'string', value: 'SELECT "User"' },
                          }),
                          name: 'SELECT "User"',
                          status: 'ok',
                        }),
                      ]),
                    });
                  },
                })
                .start()
                .completed();
            },
          );
        },
      );
    });
  });
});
