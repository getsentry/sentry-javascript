import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

// Query-span origin depends on which instrumentation is active. Blocks driving the SDK's default
// integrations get the diagnostics-channel origin when the generic orchestrion run is enabled (via
// INJECT_ORCHESTRION), since the OTel `Postgres` integration is then swapped for the channel one. Blocks
// that pass an explicit `postgresIntegration()` (e.g. `ignoreConnectSpans`) keep the OTel origin.
const QUERY_ORIGIN = 'auto.db.postgres';

const COMMON_DB_ATTRIBUTES = {
  'db.connection_string': {
    type: 'string',
    value: expect.stringMatching(/^postgresql:\/\/localhost:\d+\/tests$/),
  },
  'db.namespace': {
    type: 'string',
    value: 'tests',
  },
  'db.system.name': {
    type: 'string',
    value: 'postgresql',
  },
  'db.user': {
    type: 'string',
    value: 'test',
  },
  'server.address': {
    type: 'string',
    value: 'localhost',
  },
  'server.port': {
    type: 'integer',
    value: expect.any(Number),
  },
  'sentry.kind': {
    type: 'string',
    value: 'client',
  },
  'sentry.environment': {
    type: 'string',
    value: 'production',
  },
  'sentry.op': {
    type: 'string',
    value: 'db',
  },
  'sentry.release': {
    type: 'string',
    value: '1.0',
  },
  'sentry.sdk.name': {
    type: 'string',
    value: 'sentry.javascript.node',
  },
  'sentry.sdk.version': {
    type: 'string',
    value: expect.any(String),
  },
  'sentry.segment.id': {
    type: 'string',
    value: expect.stringMatching(/^[\da-f]{16}$/),
  },
  'sentry.segment.name': {
    type: 'string',
    value: 'Test Span',
  },
  [SENTRY_TRACE_LIFECYCLE]: {
    type: 'string',
    value: 'stream',
  },
};

/**
 * Builds the expected strict shape of a streamed postgres db span.
 *
 * Query spans carry a `db.statement` and the query origin (`auto.db.otel.postgres`, or
 * `auto.db.postgres` under the generic orchestrion run — see `QUERY_ORIGIN`). The
 * `pg.connect` span has no `db.statement`, and since the pg instrumentation sets no origin on it, it
 * carries the default `manual` origin (written as an attribute on the streamed-span path; the
 * non-streamed/SDK path omits the `manual` default).
 *
 * `host` defaults to `localhost`, but the `pg-native` scenarios connect to the IPv4 loopback
 * (`127.0.0.1`) explicitly, so the reported peer name and connection string reflect that.
 *
 * `origin` defaults to `QUERY_ORIGIN`; blocks that force the OTel path (explicit `postgresIntegration()`)
 * pass `auto.db.otel.postgres` explicitly.
 *
 * With span streaming, query spans are named after the low-cardinality query summary
 * (`{operation} {table}`) rather than the full statement, so `name` and `statement` differ.
 */
function expectedDbSpan({
  name,
  statement,
  host = 'localhost',
  origin = QUERY_ORIGIN,
}: {
  name: string;
  statement?: string;
  host?: string;
  origin?: string;
}): unknown {
  // The name of a query span is its `db.query.summary`, which is reported as an attribute too.
  const attributes: Record<string, unknown> = {
    ...COMMON_DB_ATTRIBUTES,
    'server.address': {
      type: 'string',
      value: host,
    },
    'db.connection_string': {
      type: 'string',
      value: expect.stringMatching(new RegExp(`^postgresql://${host.replace(/\./g, '\\.')}:\\d+/tests$`)),
    },
  };

  if (statement) {
    attributes['db.query.text'] = {
      type: 'string',
      value: statement,
    };
    attributes['db.query.summary'] = {
      type: 'string',
      value: name,
    };
    attributes['sentry.origin'] = {
      type: 'string',
      value: origin,
    };
  } else {
    attributes['sentry.origin'] = {
      type: 'string',
      value: 'manual',
    };
  }

  return {
    attributes,
    end_timestamp: expect.any(Number),
    is_segment: false,
    name,
    parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: expect.stringMatching(/^[\da-f]{32}$/),
  };
}

const CREATE_USER_TABLE_STATEMENT =
  'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));';

const CREATE_NATIVE_USER_TABLE_STATEMENT =
  'CREATE TABLE "NativeUser" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));';

function getDbSpans(container: SerializedStreamedSpanContainer): SerializedStreamedSpanContainer['items'] {
  return container.items.filter(item => item.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'db');
}

describeWithDockerCompose('postgres auto instrumentation (streamed)', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('default', () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `pg` package with span streaming enabled', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const segmentSpan = container.items.find(item => item.is_segment);
              expect(segmentSpan?.name).toBe('Test Span');

              const dbSpans = getDbSpans(container);
              expect(dbSpans.length).toBe(5);

              expect(dbSpans).toEqual([
                expectedDbSpan({ name: 'pg.connect' }),
                expectedDbSpan({ name: 'CREATE TABLE "User"', statement: CREATE_USER_TABLE_STATEMENT }),
                expectedDbSpan({
                  name: 'INSERT "User"',
                  statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                }),
                expectedDbSpan({ name: 'SELECT "User"', statement: 'SELECT * FROM "User"' }),
                expectedDbSpan({ name: 'DROP TABLE "User"', statement: 'DROP TABLE "User"' }),
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
              const dbSpans = getDbSpans(container);
              expect(dbSpans.find(span => span.name.includes('connect'))).toBeUndefined();
              expect(dbSpans.length).toBe(4);

              // `postgresIntegration()` is the diagnostics-channel implementation by default, so query
              // spans carry the orchestrion origin even when passing explicit options like
              // `ignoreConnectSpans`.
              const origin = 'auto.db.postgres';
              expect(dbSpans).toEqual([
                expectedDbSpan({ name: 'CREATE TABLE "User"', statement: CREATE_USER_TABLE_STATEMENT, origin }),
                expectedDbSpan({
                  name: 'INSERT "User"',
                  statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                  origin,
                }),
                expectedDbSpan({ name: 'SELECT "User"', statement: 'SELECT * FROM "User"', origin }),
                expectedDbSpan({ name: 'DROP TABLE "User"', statement: 'DROP TABLE "User"', origin }),
              ]);
            },
          })
          .start()
          .completed();
      });
    });
  });

  conditionalTest({ max: 25 })('pg-native', () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario-native.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test(
          'should auto-instrument `pg-native` package with span streaming enabled',
          { timeout: 120_000 },
          async () => {
            await createTestRunner()
              .expect({
                span: container => {
                  const segmentSpan = container.items.find(item => item.is_segment);
                  expect(segmentSpan?.name).toBe('Test Span');

                  const dbSpans = getDbSpans(container);
                  expect(dbSpans.length).toBe(5);

                  expect(dbSpans).toEqual([
                    expectedDbSpan({ name: 'pg.connect', host: '127.0.0.1' }),
                    expectedDbSpan({
                      name: 'CREATE TABLE "NativeUser"',
                      statement: CREATE_NATIVE_USER_TABLE_STATEMENT,
                      host: '127.0.0.1',
                    }),
                    expectedDbSpan({
                      name: 'INSERT "NativeUser"',
                      statement: 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)',
                      host: '127.0.0.1',
                    }),
                    expectedDbSpan({
                      name: 'SELECT "NativeUser"',
                      statement: 'SELECT * FROM "NativeUser"',
                      host: '127.0.0.1',
                    }),
                    expectedDbSpan({
                      name: 'DROP TABLE "NativeUser"',
                      statement: 'DROP TABLE "NativeUser"',
                      host: '127.0.0.1',
                    }),
                  ]);
                },
              })
              .start()
              .completed();
          },
        );
      },
      { additionalDependencies: { 'pg-native': '3.7.0', pg: '8.20.0' } },
    );
  });
});
