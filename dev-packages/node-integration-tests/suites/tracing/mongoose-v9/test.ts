import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins the highest mongoose 9 below 9.7, the top of the IITM patcher's `>=5.9.7 <9.7.0` range, so the
// monkey-patch path is exercised against a real mongoose 9. mongoose >= 9.7 publishes via
// diagnostics_channel and is covered by the `mongoose-tracing-channel` suite instead.
describe('Mongoose v9 Test', () => {
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

  const expectedSpan = (operation: string) =>
    expect.objectContaining({
      data: expect.objectContaining({
        'db.collection.name': 'blogposts',
        'db.operation.name': operation,
        'db.system.name': 'mongodb',
      }),
      description: `mongoose.BlogPost.${operation}`,
      op: 'db',
      origin,
    });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expectedSpan('save'),
      expectedSpan('findOne'),
      expectedSpan('aggregate'),
      expectedSpan('insertMany'),
      expectedSpan('bulkWrite'),
      // Document instance methods are instrumented via Query.exec on v9 (no doc-method patch).
      expectedSpan('updateOne'),
      expectedSpan('deleteOne'),
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

  const STREAMED_OPERATIONS = ['save', 'findOne', 'aggregate', 'insertMany', 'bulkWrite', 'updateOne', 'deleteOne'];

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments `mongoose` v9.', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });

      test('auto-instruments `mongoose` v9 with span streaming enabled.', async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          .expect({
            span: (container: SerializedStreamedSpanContainer) => {
              expect(container.items.find(item => item.is_segment)?.name).toBe('Test Transaction');

              for (const operation of STREAMED_OPERATIONS) {
                expect(container.items).toContainEqual(expectedStreamedSpan(operation));
              }
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongoose: '>=9 <9.7' } },
  );
});
