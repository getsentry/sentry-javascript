import type { TransactionEvent } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongodb 7 so the >= 6.4 promise-based `Connection.prototype.command`
// band is exercised against a real mongodb. mongodb 7 requires Node >= 20.19, so this suite is
// skipped on older Node (on Node 18 the driver throws `ReferenceError: crypto is not defined`).
conditionalTest({ min: 20 })('MongoDB v7 auto-instrumentation', () => {
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
      test('auto-instruments modern `mongodb` (>= 6.4 promise command).', async () => {
        await createTestRunner()
          .expect({
            transaction: (event: TransactionEvent) => {
              const spans = event.spans || [];
              expect(spans).toContainEqual(spanFor('insert'));
              expect(spans).toContainEqual(spanFor('find'));
              expect(spans).toContainEqual(spanFor('update'));
              // No orphaned handshake/heartbeat spans!
              // every command span has a parent.
              const mongoSpans = spans.filter(s => s.origin === origin);
              expect(mongoSpans.length).toBeGreaterThan(0);
              for (const s of mongoSpans) {
                expect(s.parent_span_id).toBeTruthy();
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
