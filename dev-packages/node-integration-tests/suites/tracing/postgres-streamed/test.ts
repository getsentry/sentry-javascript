import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const COMMON_DB_ATTRIBUTES = {
  'db.connection_string': {
    type: 'string',
    value: expect.stringMatching(/^postgresql:\/\/localhost:\d+\/tests$/),
  },
  'db.name': {
    type: 'string',
    value: 'tests',
  },
  'db.system': {
    type: 'string',
    value: 'postgresql',
  },
  'db.user': {
    type: 'string',
    value: 'test',
  },
  'net.peer.name': {
    type: 'string',
    value: 'localhost',
  },
  'net.peer.port': {
    type: 'integer',
    value: expect.any(Number),
  },
  'otel.kind': {
    type: 'string',
    value: 'CLIENT',
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
  'sentry.source': {
    type: 'string',
    value: 'task',
  },
  'sentry.span.source': {
    type: 'string',
    value: 'task',
  },
};

/**
 * Builds the expected strict shape of a streamed postgres db span.
 * The `pg.connect` span has neither a `db.statement` nor a `sentry.origin`,
 * whereas query spans carry both.
 */
function expectedDbSpan({ name, statement }: { name: string; statement?: string }): unknown {
  const attributes: Record<string, unknown> = { ...COMMON_DB_ATTRIBUTES };

  if (statement) {
    attributes['db.statement'] = {
      type: 'string',
      value: statement,
    };
    attributes['sentry.origin'] = {
      type: 'string',
      value: 'auto.db.otel.postgres',
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
  return container.items.filter(item => item.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'db');
}

describe('postgres auto instrumentation (streamed)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('default', () => {
    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `pg` package with span streaming enabled', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({
            workingDirectory: [__dirname],
          })
          .expect({
            span: container => {
              const segmentSpan = container.items.find(item => item.is_segment);
              expect(segmentSpan?.name).toBe('Test Span');

              const dbSpans = getDbSpans(container);
              expect(dbSpans.length).toBe(4);

              expect(dbSpans).toEqual([
                expectedDbSpan({ name: 'pg.connect' }),
                expectedDbSpan({ name: CREATE_USER_TABLE_STATEMENT, statement: CREATE_USER_TABLE_STATEMENT }),
                expectedDbSpan({
                  name: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                  statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                }),
                expectedDbSpan({ name: 'SELECT * FROM "User"', statement: 'SELECT * FROM "User"' }),
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
          .withDockerCompose({
            workingDirectory: [__dirname],
          })
          .expect({
            span: container => {
              const dbSpans = getDbSpans(container);
              expect(dbSpans.find(span => span.name.includes('connect'))).toBeUndefined();
              expect(dbSpans.length).toBe(3);

              expect(dbSpans).toEqual([
                expectedDbSpan({ name: CREATE_USER_TABLE_STATEMENT, statement: CREATE_USER_TABLE_STATEMENT }),
                expectedDbSpan({
                  name: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                  statement: 'INSERT INTO "User" ("email", "name") VALUES ($1, $2)',
                }),
                expectedDbSpan({ name: 'SELECT * FROM "User"', statement: 'SELECT * FROM "User"' }),
              ]);
            },
          })
          .start()
          .completed();
      });
    });
  });

  conditionalTest({ max: 25 })('pg-native', () => {
    createEsmAndCjsTests(__dirname, 'scenario-native.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `pg-native` package with span streaming enabled', { timeout: 90_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({
            workingDirectory: [__dirname],
            setupCommand: 'yarn',
          })
          .expect({
            span: container => {
              const segmentSpan = container.items.find(item => item.is_segment);
              expect(segmentSpan?.name).toBe('Test Span');

              const dbSpans = getDbSpans(container);
              expect(dbSpans.length).toBe(4);

              expect(dbSpans).toEqual([
                expectedDbSpan({ name: 'pg.connect' }),
                expectedDbSpan({
                  name: CREATE_NATIVE_USER_TABLE_STATEMENT,
                  statement: CREATE_NATIVE_USER_TABLE_STATEMENT,
                }),
                expectedDbSpan({
                  name: 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)',
                  statement: 'INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)',
                }),
                expectedDbSpan({ name: 'SELECT * FROM "NativeUser"', statement: 'SELECT * FROM "NativeUser"' }),
              ]);
            },
          })
          .start()
          .completed();
      });
    });
  });
});
