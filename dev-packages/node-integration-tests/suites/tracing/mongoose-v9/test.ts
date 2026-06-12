import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongoose 9 (top of our supported `>=5.9.7 <10` range) so the latest major is exercised
// against a real mongoose. mongoose 9 requires Node >=20.19, so this suite is skipped on older Node.
conditionalTest({ min: 20 })('Mongoose v9 Test', () => {
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
      test('auto-instruments `mongoose` v9.', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    },
    { additionalDependencies: { mongoose: '^9' } },
  );
});
