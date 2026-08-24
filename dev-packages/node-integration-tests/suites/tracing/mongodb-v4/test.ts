import type { TransactionEvent } from '@sentry/core';
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
        'sentry.origin': origin,
        'sentry.op': 'db',
        'db.system.name': 'mongodb',
        'db.namespace': 'admin',
        'db.collection.name': 'movies',
        'db.operation.name': operation,
        'db.connection_string': expect.any(String),
        'db.query.text': expect.any(String),
      }),
      op: 'db',
      origin,
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
                  (s.data as Record<string, unknown>)?.['db.operation.name'] === 'find' &&
                  opIds.has(s.parent_span_id as string),
              );
              expect(new Set(pooledFinds.map(s => s.parent_span_id)).size).toBe(3);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongodb: '4.17.2' } },
  );
});
