import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongoose 8 (>= 8.21) so the document `updateOne`/`deleteOne` lazy-Query path is exercised
// against a real mongoose, guarding the thenable trap that mongoose 6 (the workspace version) can't hit.
describe('Mongoose v8 Test', () => {
  const origin = 'auto.db.mongoose';
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

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'db.collection.name': 'blogposts',
          'db.operation.name': 'save',
          'db.system.name': 'mongodb',
        }),
        description: 'mongoose.BlogPost.save',
        op: 'db',
        origin,
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.collection.name': 'blogposts',
          'db.operation.name': 'updateOne',
          'db.system.name': 'mongodb',
        }),
        description: 'mongoose.BlogPost.updateOne',
        op: 'db',
        origin,
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.collection.name': 'blogposts',
          'db.operation.name': 'deleteOne',
          'db.system.name': 'mongodb',
        }),
        description: 'mongoose.BlogPost.deleteOne',
        op: 'db',
        origin,
      }),
    ]),
  };

  const expectedStreamedSpan = (operation: string) =>
    expect.objectContaining({
      name: `${operation} blogposts`,
      is_segment: false,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      attributes: expect.objectContaining({
        'db.collection.name': { type: 'string', value: 'blogposts' },
        'db.operation.name': { type: 'string', value: operation },
        'db.system.name': { type: 'string', value: 'mongodb' },
        'sentry.op': { type: 'string', value: 'db' },
        'sentry.origin': { type: 'string', value: origin },
        'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
      }),
    });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments `mongoose` v8 document methods.', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });

      test('auto-instruments `mongoose` v8 document methods with span streaming enabled.', async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          .expect({
            span: (container: SerializedStreamedSpanContainer) => {
              expect(container.items.find(item => item.is_segment)?.name).toBe('Test Transaction');

              for (const operation of ['save', 'updateOne', 'deleteOne']) {
                expect(container.items).toContainEqual(expectedStreamedSpan(operation));
              }
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongoose: '^8' } },
  );
});
