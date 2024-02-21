import { MongoMemoryServer } from 'mongodb-memory-server-global';

import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

jest.setTimeout(20000);

describe('MongoDB experimental Test', () => {
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
          'db.system': 'mongodb',
          'db.name': 'admin',
          'db.operation': 'insert',
          'db.mongodb.collection': 'movies',
        }),
        description: '{"title":"?","_id":"?"}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.system': 'mongodb',
          'db.name': 'admin',
          'db.operation': 'find',
          'db.mongodb.collection': 'movies',
        }),
        description: '{"title":"?"}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.system': 'mongodb',
          'db.name': 'admin',
          'db.operation': 'update',
          'db.mongodb.collection': 'movies',
        }),
        description: '{"title":"?"}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.system': 'mongodb',
          'db.name': 'admin',
          'db.operation': 'find',
          'db.mongodb.collection': 'movies',
        }),
        description: '{"title":"?"}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.system': 'mongodb',
          'db.name': 'admin',
          'db.operation': 'find',
          'db.mongodb.collection': 'movies',
        }),
        description: '{"title":"?"}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
    ]),
  };

  test('CJS - should auto-instrument `mongodb` package.', done => {
    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
