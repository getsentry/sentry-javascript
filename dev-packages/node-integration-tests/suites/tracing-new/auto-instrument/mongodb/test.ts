import { MongoMemoryServer } from 'mongodb-memory-server-global';

import { TestEnv, assertSentryTransaction } from '../../../../utils';

// This test can take longer.
jest.setTimeout(15000);

describe('MongoDB Test', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URL = mongoServer.getUri();
  }, 10000);

  afterAll(async () => {
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  test('should auto-instrument `mongodb` package.', async () => {
    const env = await TestEnv.init(__dirname);
    const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

    expect(envelope).toHaveLength(3);

    assertSentryTransaction(envelope[2], {
      transaction: 'Test Transaction',
      spans: [
        {
          data: {
            'db.system': 'mongodb',
            'db.name': 'admin',
            'db.operation': 'insertOne',
            'db.mongodb.collection': 'movies',
          },
          description: 'insertOne',
          op: 'db',
        },
        {
          data: {
            'db.system': 'mongodb',
            'db.name': 'admin',
            'db.operation': 'findOne',
            'db.mongodb.collection': 'movies',
          },
          description: 'findOne',
          op: 'db',
        },
        {
          data: {
            'db.system': 'mongodb',
            'db.name': 'admin',
            'db.operation': 'updateOne',
            'db.mongodb.collection': 'movies',
          },
          description: 'updateOne',
          op: 'db',
        },
        {
          data: {
            'db.system': 'mongodb',
            'db.name': 'admin',
            'db.operation': 'findOne',
            'db.mongodb.collection': 'movies',
          },
          description: 'findOne',
          op: 'db',
        },
        {
          data: {
            'db.system': 'mongodb',
            'db.name': 'admin',
            'db.operation': 'find',
            'db.mongodb.collection': 'movies',
          },
          description: 'find',
          op: 'db',
        },
      ],
    });
  });
});
