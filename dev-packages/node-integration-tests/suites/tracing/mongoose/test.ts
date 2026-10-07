import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Mongoose experimental Test', () => {
  const origin = 'auto.db.mongoose';
  const driverOrigin = 'auto.db.mongo';
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

  const expectedStreamedSpan = (operation: string, collection = 'blogposts', status = 'ok') =>
    expect.objectContaining({
      name: `${operation} ${collection}`,
      is_segment: false,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      status,
      attributes: expect.objectContaining({
        [DB_COLLECTION_NAME]: { type: 'string', value: collection },
        [DB_NAMESPACE]: { type: 'string', value: 'test' },
        [DB_OPERATION_NAME]: { type: 'string', value: operation },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'mongodb' },
        [SENTRY_OP]: { type: 'string', value: 'db' },
        [SENTRY_ORIGIN]: { type: 'string', value: origin },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
      }),
    });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `mongoose` package.', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('Test Transaction');

            for (const operation of ['save', 'findOne', 'aggregate', 'insertMany', 'bulkWrite', 'remove']) {
              expect(container.items).toContainEqual(expectedStreamedSpan(operation));
            }

            expect(container.items).toContainEqual(expectedStreamedSpan('save', 'requireddocs', 'error'));
          },
        })
        .start()
        .completed();
    });

    test('nests the mongodb driver span under the mongoose span', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const spans = container.items;
            const mongooseSave = spans.find(
              span => span.name === 'save blogposts' && span.attributes[SENTRY_ORIGIN]?.value === origin,
            );
            expect(mongooseSave).toBeDefined();
            // the underlying mongodb driver span must be parented to the mongoose span
            const driverChild = spans.find(
              span =>
                span.parent_span_id === mongooseSave?.span_id && span.attributes[SENTRY_ORIGIN]?.value === driverOrigin,
            );
            expect(driverChild).toBeDefined();
          },
        })
        .start()
        .completed();
    });

    test('parents a query to the span it was built in, not where it executes', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const spans = container.items;
            const builder = spans.find(span => span.name === 'query-builder');
            expect(builder).toBeDefined();
            // the query was built inside `query-builder` but awaited after it ended, so its exec
            // span must parent to `query-builder` rather than the active span at exec time
            const findExec = spans.find(
              span =>
                span.name === 'findOne blogposts' &&
                span.attributes[SENTRY_ORIGIN]?.value === origin &&
                span.parent_span_id === builder?.span_id,
            );
            expect(findExec).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });
});
