import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

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
      expect.objectContaining({
        data: expect.objectContaining({
          'db.mongodb.collection': 'blogposts',
          'db.name': 'test',
          'db.operation': 'aggregate',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.BlogPost.aggregate',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.mongodb.collection': 'blogposts',
          'db.name': 'test',
          'db.operation': 'insertMany',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.BlogPost.insertMany',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'db.mongodb.collection': 'blogposts',
          'db.name': 'test',
          'db.operation': 'bulkWrite',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.BlogPost.bulkWrite',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
      }),
      // A failing operation still produces a span, marked with an error status.
      expect.objectContaining({
        data: expect.objectContaining({
          'db.operation': 'save',
          'db.system': 'mongoose',
        }),
        description: 'mongoose.RequiredDoc.save',
        op: 'db',
        origin: 'auto.db.otel.mongoose',
        status: 'internal_error',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `mongoose` package.', async () => {
      await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
    });

    test('nests the mongodb driver span under the mongoose span', async () => {
      await createTestRunner()
        .expect({
          transaction: event => {
            const spans = event.spans || [];
            const mongooseSave = spans.find(span => span.description === 'mongoose.BlogPost.save');
            expect(mongooseSave).toBeDefined();
            // the underlying mongodb driver span must be parented to the mongoose span
            const driverChild = spans.find(
              span => span.parent_span_id === mongooseSave?.span_id && span.origin === 'auto.db.otel.mongo',
            );
            expect(driverChild).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });
});
