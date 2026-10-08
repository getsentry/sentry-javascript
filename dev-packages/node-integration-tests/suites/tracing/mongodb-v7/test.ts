import {
  DB_COLLECTION_NAME,
  DB_CONNECTION_STRING,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongodb 7 so the >= 6.4 promise-based `Connection.prototype.command`
// band is exercised against a real mongodb.
describe('MongoDB v7 auto-instrumentation', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URL = mongoServer.getUri();
  }, 30000);

  afterAll(async () => {
    if (mongoServer) {
      await mongoServer.stop();
    }
    cleanupChildProcesses();
  });

  const origin = 'auto.db.mongo';

  // `db.statement` (scrubbed full command doc) and `db.connection_string` vary
  // by driver version, so assert their presence rather than exact content;
  // the operation-identifying attributes are exact.
  const streamedSpanFor = (operation: string): unknown =>
    expect.objectContaining({
      name: `${operation} movies`,
      is_segment: false,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      status: 'ok',
      attributes: expect.objectContaining({
        [SENTRY_ORIGIN]: { type: 'string', value: origin },
        [SENTRY_OP]: { type: 'string', value: DB },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'mongodb' },
        [DB_NAMESPACE]: { type: 'string', value: 'admin' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'movies' },
        [DB_OPERATION_NAME]: { type: 'string', value: operation },
        [DB_CONNECTION_STRING]: { type: 'string', value: expect.any(String) },
        [DB_QUERY_TEXT]: { type: 'string', value: expect.any(String) },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
      }),
    });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments modern `mongodb` (>= 6.4 promise command).', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const spans = container.items;
              expect(spans).toContainEqual(streamedSpanFor('insert'));
              expect(spans).toContainEqual(streamedSpanFor('find'));
              expect(spans).toContainEqual(streamedSpanFor('update'));

              expect(container.items.find(item => item.is_segment)?.name).toBe('Test Transaction');

              const mongoSpans = spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === origin);
              expect(mongoSpans.length).toBeGreaterThan(0);
              for (const span of mongoSpans) {
                expect(span.is_segment).toBe(false);
                expect(span.parent_span_id).toBeTruthy();
              }
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongodb: '7.5.0' } },
  );
});
