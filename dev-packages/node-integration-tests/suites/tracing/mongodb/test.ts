import {
  DB_COLLECTION_NAME,
  DB_CONNECTION_STRING,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  ERROR_TYPE,
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
  SENTRY_STATUS_MESSAGE,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
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
          [DB_CONNECTION_STRING]: expect.any(String),
          [DB_NAMESPACE]: 'admin',
          [DB_SYSTEM_NAME]: 'mongodb',
          [SENTRY_ENVIRONMENT]: 'production',
          [SENTRY_KIND]: 'client',
          [SENTRY_OP]: DB,
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
        [SERVER_PORT]: { type: 'integer', value: expect.any(Number) },
        [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: false },
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
    test('should auto-instrument `mongodb` package.', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)).toMatchObject({
              name: 'Test Transaction',
              span_id: expect.any(String),
              start_timestamp: expect.anything(),
              end_timestamp: expect.anything(),
            });

            const spans = container.items.filter(item => !item.is_segment);

            // Count by operation so an extra driver command produces a readable diff.
            const operationCounts = spans.reduce<Record<string, number>>((acc, span) => {
              const operation = span.attributes[DB_OPERATION_NAME]?.value;
              let op = typeof operation === 'string' ? operation : undefined;
              if (!op) {
                const statement = span.attributes[DB_QUERY_TEXT]?.value;
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
