import {
  DB_COLLECTION_NAME,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Pins mongoose 7 so the `contextCaptureFunctions7` version branch is exercised against a real mongoose.
describe('Mongoose v7 Test', () => {
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

  const expectedStreamedSpan = (operation: string) =>
    expect.objectContaining({
      name: `${operation} blogposts`,
      is_segment: false,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      attributes: expect.objectContaining({
        [DB_COLLECTION_NAME]: { type: 'string', value: 'blogposts' },
        [DB_OPERATION_NAME]: { type: 'string', value: operation },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'mongodb' },
        [SENTRY_OP]: { type: 'string', value: DB },
        [SENTRY_ORIGIN]: { type: 'string', value: origin },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
      }),
    });

  const STREAMED_OPERATIONS = ['save', 'findOne', 'aggregate', 'insertMany', 'bulkWrite'];

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('auto-instruments `mongoose` v7.', async () => {
        await createTestRunner()
          .expect({
            span: container => {
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
    { additionalDependencies: { mongoose: '^7' } },
  );
});
