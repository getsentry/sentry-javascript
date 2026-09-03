import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer, TransactionEvent } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongodb 4 so the = 4.0 <6.4 callback-based command band and the
// pool-checkout context propagation are exercised against a real mongodb.
describe('MongoDB v4 auto-instrumentation', () => {
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

  const spanFor = (operation: string): unknown =>
    expect.objectContaining({
      data: expect.objectContaining({
        [SENTRY_ORIGIN]: origin,
        [SENTRY_OP]: 'db',
        [DB_SYSTEM_NAME]: 'mongodb',
        [DB_NAMESPACE]: 'admin',
        [DB_COLLECTION_NAME]: 'movies',
        [DB_OPERATION_NAME]: operation,
        // `db.connection_string` has no `@sentry/conventions` constant — it stays inlined to match
        // what `@opentelemetry/instrumentation-mongodb` emitted.
        'db.connection_string': expect.any(String),
        [DB_QUERY_TEXT]: expect.any(String),
      }),
      op: 'db',
      origin,
    });

  const streamedSpanFor = (operation: string): unknown =>
    expect.objectContaining({
      name: `${operation} movies`,
      is_segment: false,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      status: 'ok',
      attributes: expect.objectContaining({
        [SENTRY_ORIGIN]: { type: 'string', value: origin },
        [SENTRY_OP]: { type: 'string', value: 'db' },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'mongodb' },
        [DB_NAMESPACE]: { type: 'string', value: 'admin' },
        [DB_COLLECTION_NAME]: { type: 'string', value: 'movies' },
        [DB_OPERATION_NAME]: { type: 'string', value: operation },
        'db.connection_string': { type: 'string', value: expect.any(String) },
        [DB_QUERY_TEXT]: { type: 'string', value: expect.any(String) },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
      }),
    });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments `mongodb` (>= 4.0 < 6.4 callback command) and parents pooled ops correctly.', async () => {
        await createTestRunner()
          .expect({
            transaction: (event: TransactionEvent) => {
              const spans = event.spans || [];
              expect(spans).toContainEqual(spanFor('insert'));
              expect(spans).toContainEqual(spanFor('find'));
              expect(spans).toContainEqual(spanFor('update'));

              // Checkout context propagation: each `op-*` span must be the
              // parent of its own find command. A lost context would collapse
              // them onto one parent (or the transaction).
              const opIds = new Set(spans.filter(s => /^op-[abc]$/.test(s.description ?? '')).map(s => s.span_id));
              expect(opIds.size).toBe(3);
              const pooledFinds = spans.filter(
                s =>
                  s.origin === origin &&
                  (s.data as Record<string, unknown>)?.[DB_OPERATION_NAME] === 'find' &&
                  opIds.has(s.parent_span_id as string),
              );
              expect(new Set(pooledFinds.map(s => s.parent_span_id)).size).toBe(3);
            },
          })
          .start()
          .completed();
      });

      test('auto-instruments `mongodb` and parents pooled ops correctly with span streaming enabled.', async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          .expect({
            span: (container: SerializedStreamedSpanContainer) => {
              const spans = container.items;
              expect(spans).toContainEqual(streamedSpanFor('insert'));
              expect(spans).toContainEqual(streamedSpanFor('find'));
              expect(spans).toContainEqual(streamedSpanFor('update'));

              const opIds = new Set(spans.filter(span => /^op-[abc]$/.test(span.name)).map(span => span.span_id));
              expect(opIds.size).toBe(3);
              const pooledFinds = spans.filter(
                span =>
                  span.attributes[SENTRY_ORIGIN]?.value === origin &&
                  span.attributes[DB_OPERATION_NAME]?.value === 'find' &&
                  opIds.has(span.parent_span_id as string),
              );
              expect(new Set(pooledFinds.map(span => span.parent_span_id)).size).toBe(3);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongodb: '4.17.2' } },
  );
});
