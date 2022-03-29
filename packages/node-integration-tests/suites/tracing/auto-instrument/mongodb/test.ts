import { MongoMemoryServer } from 'mongodb-memory-server';

import { assertSentryTransaction, conditionalTest, getEnvelopeRequest, runServer } from '../../../../utils';

conditionalTest({ min: 12 })('MongoDB Test', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URL = mongoServer.getUri();
  }, 30000);

  afterAll(async () => {
    await mongoServer.stop();
  });

  test('should auto-instrument `mongodb` package.', async () => {
    const url = await runServer(__dirname);

    const envelope = await getEnvelopeRequest(url);

    expect(envelope).toHaveLength(3);

    assertSentryTransaction(envelope[2], {
      transaction: 'Test Transaction',
      spans: [
        {
          data: {
            collectionName: 'movies',
            dbName: 'admin',
            namespace: 'admin.movies',
            doc: '{"title":"Rick and Morty"}',
          },
          description: 'insertOne',
          op: 'db',
        },
        {
          data: {
            collectionName: 'movies',
            dbName: 'admin',
            namespace: 'admin.movies',
            query: '{"title":"Back to the Future"}',
          },
          description: 'findOne',
          op: 'db',
        },
        {
          data: {
            collectionName: 'movies',
            dbName: 'admin',
            namespace: 'admin.movies',
            query: '{"title":"Back to the Future"}',
          },
          description: 'find',
          op: 'db',
        },
        {
          data: {
            collectionName: 'movies',
            dbName: 'admin',
            namespace: 'admin.movies',
            filter: '{"title":"Back to the Future"}',
            update: '{"$set":{"title":"South Park"}}',
          },
          description: 'updateOne',
          op: 'db',
        },
        {
          data: {
            collectionName: 'movies',
            dbName: 'admin',
            namespace: 'admin.movies',
            query: '{"title":"South Park"}',
          },
          description: 'findOne',
          op: 'db',
        },
        {
          data: {
            collectionName: 'movies',
            dbName: 'admin',
            namespace: 'admin.movies',
            query: '{"title":"South Park"}',
          },
          description: 'find',
          op: 'db',
        },
      ],
    });
  });
});
