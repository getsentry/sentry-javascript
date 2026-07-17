import type { TransactionEvent } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongodb 6 so the >= 6.4 promise-based `Connection.prototype.command`
// band is exercised against a real mongodb.
describe('MongoDB v6 auto-instrumentation', () => {
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

  const origin = isOrchestrionEnabled() ? 'auto.db.orchestrion.mongo' : 'auto.db.otel.mongo';

  // `db.statement` (scrubbed full command doc) and `db.connection_string` vary
  // by driver version, so assert their presence rather than exact content;
  // the operation-identifying attributes are exact.
  const spanFor = (operation: string): unknown =>
    expect.objectContaining({
      data: expect.objectContaining({
        'sentry.origin': origin,
        'sentry.op': 'db',
        'db.system': 'mongodb',
        'db.name': 'admin',
        'db.mongodb.collection': 'movies',
        'db.operation': operation,
        'db.connection_string': expect.any(String),
        'db.statement': expect.any(String),
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
    { additionalDependencies: { mongodb: '6.21.0' } },
  );
});
