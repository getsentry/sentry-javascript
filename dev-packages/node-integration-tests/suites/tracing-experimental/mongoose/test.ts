import { MongoMemoryServer } from 'mongodb-memory-server-global';

import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(20000);

describe('Mongoose experimental Test', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URL = mongoServer.getUri();
  }, 10000);

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
          'db.name': 'test',
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
          'db.name': 'test',
          'db.operation': 'findOne',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.BlogPost.findOne',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
      }),
    ]),
  };

  test('CJS - should auto-instrument `mongoose` package.', done => {
    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
