import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  ERROR_TYPE,
  SENTRY_ENVIRONMENT,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_RELEASE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_STATUS_MESSAGE,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer, TransactionEvent } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { assertSentryTransaction } from '../../../utils/assertions';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('MongoDB auto-instrumentation', () => {
  const origin = 'auto.db.mongo';
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URL = mongoServer.getUri();
  }, 10000);

  afterAll(async () => {
    if (mongoServer) {
      await mongoServer.stop();
    }
    cleanupChildProcesses();
  });

  const SPAN_FIND_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': origin,
      'sentry.op': 'db',
      'db.system.name': 'mongodb',
      'db.namespace': 'admin',
      'db.collection.name': 'movies',
      'db.operation.name': 'find',
      'db.connection_string': expect.any(String),
      'server.address': expect.any(String),
      'server.port': expect.any(Number),
      'db.query.text': '{"title":"?"}',
      'sentry.kind': 'client',
    },
    description: '{"title":"?"}',
    op: 'db',
    origin,
  });

  const SPAN_INSERT_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': origin,
      'sentry.op': 'db',
      'db.system.name': 'mongodb',
      'db.namespace': 'admin',
      'db.collection.name': 'movies',
      'db.operation.name': 'insert',
      'db.connection_string': expect.any(String),
      'server.address': expect.any(String),
      'server.port': expect.any(Number),
      'db.query.text': '{"title":"?","_id":{"_bsontype":"?","id":"?"}}',
      'sentry.kind': 'client',
    },
    description: '{"title":"?","_id":{"_bsontype":"?","id":"?"}}',
    op: 'db',
    origin,
  });

  const SPAN_ISMASTER_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': origin,
      'sentry.op': 'db',
      'db.system.name': 'mongodb',
      'db.namespace': 'admin',
      'db.collection.name': '$cmd',
      'db.operation.name': 'isMaster',
      'db.connection_string': expect.any(String),
      'server.address': expect.any(String),
      'server.port': expect.any(Number),
      'db.query.text':
        '{"ismaster":"?","client":{"driver":{"name":"?","version":"?"},"os":{"type":"?","name":"?","architecture":"?","version":"?"},"platform":"?"},"compression":[],"helloOk":"?"}',
      'sentry.kind': 'client',
    },
    description:
      '{"ismaster":"?","client":{"driver":{"name":"?","version":"?"},"os":{"type":"?","name":"?","architecture":"?","version":"?"},"platform":"?"},"compression":[],"helloOk":"?"}',
    op: 'db',
    origin,
  });

  const SPAN_UPDATE_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': origin,
      'sentry.op': 'db',
      'db.system.name': 'mongodb',
      'db.namespace': 'admin',
      'db.collection.name': 'movies',
      'db.operation.name': 'update',
      'db.connection_string': expect.any(String),
      'server.address': expect.any(String),
      'server.port': expect.any(Number),
      'db.query.text': '{"title":"?"}',
      'sentry.kind': 'client',
    },
    description: '{"title":"?"}',
    op: 'db',
    origin,
  });

  // A query the server rejects: same attributes as a successful find, but with an error status.
  const SPAN_FIND_ERROR_MATCHER = expect.objectContaining({
    data: expect.objectContaining({
      'sentry.origin': origin,
      'sentry.op': 'db',
      'db.system.name': 'mongodb',
      'db.operation.name': 'find',
      'db.query.text': '{"$thisOperatorDoesNotExist":"?"}',
      'sentry.kind': 'client',
    }),
    description: '{"$thisOperatorDoesNotExist":"?"}',
    op: 'db',
    origin,
    status: 'internal_error',
  });

  const SPAN_ENDSESSIONS_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': origin,
      'sentry.op': 'db',
      'db.system.name': 'mongodb',
      'db.namespace': 'admin',
      'db.collection.name': '$cmd',
      'db.connection_string': expect.any(String),
      'server.address': expect.any(String),
      'server.port': expect.any(Number),
      'db.query.text': '{"endSessions":[{"id":{"_bsontype":"?","sub_type":"?","position":"?","buffer":"?"}}]}',
      'sentry.kind': 'client',
    },
    description: '{"endSessions":[{"id":{"_bsontype":"?","sub_type":"?","position":"?","buffer":"?"}}]}',
    op: 'db',
    origin,
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `mongodb` package.', async () => {
      await createTestRunner()
        .expect({
          transaction: (txn: TransactionEvent) => {
            assertSentryTransaction(txn, { transaction: 'Test Transaction' });
            const spans = txn.spans || [];

            // Assert the per-operation breakdown rather than just a total span
            // count. When the driver occasionally emits an extra command
            // (e.g. a stray `isMaster` from a reconnect, a `ping`, or a
            // heartbeat), `toEqual` shows a clear per-operation diff like
            // "isMaster: 2 → 3" instead of an opaque "8 vs 9" length
            // mismatch — making future flakes self-diagnosing.
            //
            // `db.operation` isn't set on every span — the `endSessions`
            // command exposes its name only via `db.statement` — so derive
            // the operation by parsing the leading command name out of
            // `db.statement` as a fallback.
            const operationCounts = spans.reduce<Record<string, number>>((acc, span) => {
              const data = (span.data ?? {}) as Record<string, unknown>;
              let op =
                typeof data['db.operation.name'] === 'string' ? (data['db.operation.name'] as string) : undefined;
              if (!op) {
                const stmt = data['db.query.text'];
                const match = typeof stmt === 'string' ? stmt.match(/^\{"(\w+)"/) : null;
                op = match ? match[1] : 'unknown';
              }
              acc[op] = (acc[op] || 0) + 1;
              return acc;
            }, {});

            expect(operationCounts).toEqual({
              find: 4,
              isMaster: 2,
              insert: 1,
              update: 1,
              endSessions: 1,
            });

            expect(spans).toContainEqual(SPAN_FIND_MATCHER);
            expect(spans).toContainEqual(SPAN_INSERT_MATCHER);
            expect(spans).toContainEqual(SPAN_ISMASTER_MATCHER);
            expect(spans).toContainEqual(SPAN_UPDATE_MATCHER);
            expect(spans).toContainEqual(SPAN_FIND_ERROR_MATCHER);
            expect(spans).toContainEqual(SPAN_ENDSESSIONS_MATCHER);
          },
        })
        .start()
        .completed();
    });
  });

  describe('streamed', () => {
    const streamAttributes = (values: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { type: 'string', value }]));

    function streamedSpan({
      name,
      status = 'ok',
      attributes,
    }: {
      name: string;
      status?: string;
      attributes: Record<string, unknown>;
    }): unknown {
      return {
        name,
        attributes: {
          ...streamAttributes({
            'db.connection_string': expect.any(String),
            [DB_NAMESPACE]: 'admin',
            [DB_SYSTEM_NAME]: 'mongodb',
            [SENTRY_ENVIRONMENT]: 'production',
            [SENTRY_KIND]: 'client',
            [SENTRY_OP]: 'db',
            [SENTRY_ORIGIN]: origin,
            [SENTRY_RELEASE]: '1.0',
            [SENTRY_SDK_NAME]: 'sentry.javascript.node',
            [SENTRY_SDK_VERSION]: expect.any(String),
            [SENTRY_SEGMENT_ID]: expect.stringMatching(/^[\da-f]{16}$/),
            [SENTRY_SEGMENT_NAME]: 'Test Transaction',
            [SERVER_ADDRESS]: expect.any(String),
            [SENTRY_TRACE_LIFECYCLE]: 'stream',
            ...attributes,
          }),
          'server.port': { type: 'integer', value: expect.any(Number) },
        },
        end_timestamp: expect.any(Number),
        is_segment: false,
        parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status,
        trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      };
    }

    const STREAMED_FIND_MATCHER = streamedSpan({
      name: 'find movies',
      attributes: {
        [DB_COLLECTION_NAME]: 'movies',
        [DB_OPERATION_NAME]: 'find',
        [DB_QUERY_TEXT]: '{"title":"?"}',
      },
    });

    const STREAMED_INSERT_MATCHER = streamedSpan({
      name: 'insert movies',
      attributes: {
        [DB_COLLECTION_NAME]: 'movies',
        [DB_OPERATION_NAME]: 'insert',
        [DB_QUERY_TEXT]: '{"title":"?","_id":{"_bsontype":"?","id":"?"}}',
      },
    });

    const STREAMED_ISMASTER_MATCHER = streamedSpan({
      name: 'isMaster $cmd',
      attributes: {
        [DB_COLLECTION_NAME]: '$cmd',
        [DB_OPERATION_NAME]: 'isMaster',
        [DB_QUERY_TEXT]:
          '{"ismaster":"?","client":{"driver":{"name":"?","version":"?"},"os":{"type":"?","name":"?","architecture":"?","version":"?"},"platform":"?"},"compression":[],"helloOk":"?"}',
      },
    });

    const STREAMED_UPDATE_MATCHER = streamedSpan({
      name: 'update movies',
      attributes: {
        [DB_COLLECTION_NAME]: 'movies',
        [DB_OPERATION_NAME]: 'update',
        [DB_QUERY_TEXT]: '{"title":"?"}',
      },
    });

    // A query the server rejects: same attributes as a successful find, but with an error status.
    const STREAMED_FIND_ERROR_MATCHER = streamedSpan({
      name: 'find movies',
      status: 'error',
      attributes: {
        [DB_COLLECTION_NAME]: 'movies',
        [DB_OPERATION_NAME]: 'find',
        [DB_QUERY_TEXT]: '{"$thisOperatorDoesNotExist":"?"}',
        [ERROR_TYPE]: 'MongoError',
        [SENTRY_STATUS_MESSAGE]: expect.any(String),
      },
    });

    // `endSessions` exposes no operation name, so the span falls back to the collection alone.
    const STREAMED_ENDSESSIONS_MATCHER = streamedSpan({
      name: '$cmd',
      attributes: {
        [DB_COLLECTION_NAME]: '$cmd',
        [DB_QUERY_TEXT]: '{"endSessions":[{"id":{"_bsontype":"?","sub_type":"?","position":"?","buffer":"?"}}]}',
      },
    });

    createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `mongodb` package with span streaming enabled.', async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          .expect({
            span: (container: SerializedStreamedSpanContainer) => {
              expect(container.items.find(item => item.is_segment)?.name).toBe('Test Transaction');

              const spans = container.items.filter(item => !item.is_segment);

              // Same per-operation breakdown as the transaction-based test above, so an extra
              // driver command shows up as a readable per-operation diff.
              const operationCounts = spans.reduce<Record<string, number>>((acc, span) => {
                const operation = span.attributes['db.operation.name']?.value;
                let op = typeof operation === 'string' ? operation : undefined;
                if (!op) {
                  const statement = span.attributes['db.query.text']?.value;
                  const match = typeof statement === 'string' ? statement.match(/^\{"(\w+)"/) : null;
                  op = match ? match[1] : 'unknown';
                }
                acc[op] = (acc[op] || 0) + 1;
                return acc;
              }, {});

              expect(operationCounts).toEqual({
                find: 4,
                isMaster: 2,
                insert: 1,
                update: 1,
                endSessions: 1,
              });

              expect(spans).toContainEqual(STREAMED_FIND_MATCHER);
              expect(spans).toContainEqual(STREAMED_INSERT_MATCHER);
              expect(spans).toContainEqual(STREAMED_ISMASTER_MATCHER);
              expect(spans).toContainEqual(STREAMED_UPDATE_MATCHER);
              expect(spans).toContainEqual(STREAMED_FIND_ERROR_MATCHER);
              expect(spans).toContainEqual(STREAMED_ENDSESSIONS_MATCHER);
            },
          })
          .start()
          .completed();
      });
    });
  });
});
