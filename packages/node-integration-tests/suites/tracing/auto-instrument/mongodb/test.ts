import { parseSemver } from '@sentry/utils';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../../utils';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongoServer.getUri();
}, 30000);

afterAll(async () => {
  await mongoServer.stop();
});

const NODE_VERSION = parseSemver(process.versions.node);

// Skipping on Node versions below 12 as `mongo-memory-server`
const conditionalTest = NODE_VERSION.major && NODE_VERSION.major < 12 ? test.skip : test;

conditionalTest('should auto-instrument `mongodb` package.', async () => {
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
