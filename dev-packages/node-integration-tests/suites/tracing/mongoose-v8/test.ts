import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongoose 8 (>= 8.21) so the document `updateOne`/`deleteOne` lazy-Query path is exercised
// against a real mongoose, guarding the thenable trap that mongoose 6 (the workspace version) can't hit.
describe('Mongoose v8 Test', () => {
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
          'db.mongodb.collection': 'blogposts',
          'db.operation': 'save',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.BlogPost.save',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.mongodb.collection': 'blogposts',
          'db.operation': 'updateOne',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.BlogPost.updateOne',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.mongodb.collection': 'blogposts',
          'db.operation': 'deleteOne',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.BlogPost.deleteOne',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments `mongoose` v8 document methods.', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    },
    { additionalDependencies: { mongoose: '^8' } },
  );
});
