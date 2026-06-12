import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongoose 7 so the `contextCaptureFunctions7` version branch is exercised against a real mongoose.
describe('Mongoose v7 Test', () => {
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
        'db.mongodb.collection': 'blogposts',
        'db.operation': operation,
        'db.system': 'mongoose',
      }),
      description: `mongoose.BlogPost.${operation}`,
      op: 'db',
      origin: 'auto.db.otel.mongoose',
    });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expectedSpan('save'),
      expectedSpan('findOne'),
      expectedSpan('aggregate'),
      expectedSpan('insertMany'),
      expectedSpan('bulkWrite'),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments `mongoose` v7.', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    },
    { additionalDependencies: { mongoose: '^7' } },
  );
});
