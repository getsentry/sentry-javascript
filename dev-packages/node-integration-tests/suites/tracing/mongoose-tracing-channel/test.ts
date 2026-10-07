import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_BATCH_SIZE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// mongoose >= 9.7.0 publishes its operations via `node:diagnostics_channel`, so the SDK subscribes
// to those channels (`subscribeMongooseDiagnosticChannels`) instead of monkey-patching. This suite
// pins `^9.7` and asserts the diagnostics-channel path: stable OTel DB semconv attributes, redacted
// query text, span relationships, and that the legacy IITM patcher does NOT also fire (no double
// instrumentation).
describe('Mongoose tracing channel Test', () => {
  const driverOrigin = 'auto.db.mongo';
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

  const expectedStreamedSpan = (operation: string, extraAttributes: Record<string, unknown> = {}) =>
    expect.objectContaining({
      name: `${operation} blogposts`,
      is_segment: false,
      parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
      attributes: expect.objectContaining({
        [DB_COLLECTION_NAME]: { type: 'string', value: 'blogposts' },
        [DB_NAMESPACE]: { type: 'string', value: 'test' },
        [DB_OPERATION_NAME]: { type: 'string', value: operation },
        [DB_SYSTEM_NAME]: { type: 'string', value: 'mongodb' },
        [SENTRY_OP]: { type: 'string', value: 'db' },
        [SENTRY_ORIGIN]: { type: 'string', value: 'auto.db.mongoose.diagnostic_channel' },
        [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
        [SERVER_ADDRESS]: { type: 'string', value: expect.any(String) },
        [SERVER_PORT]: { type: 'integer', value: expect.any(Number) },
        ...extraAttributes,
      }),
    });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('subscribes to mongoose >= 9.7 diagnostics channels with stable semconv attributes', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              expect(container.items.find(item => item.is_segment)?.name).toBe('Test Transaction');

              expect(container.items).toContainEqual(expectedStreamedSpan('save'));
              expect(container.items).toContainEqual(
                expectedStreamedSpan('findOne', { [DB_QUERY_TEXT]: { type: 'string', value: '{"title":"?"}' } }),
              );
              expect(container.items).toContainEqual(
                expectedStreamedSpan('aggregate', {
                  [DB_QUERY_TEXT]: { type: 'string', value: '[{"$match":{"title":"?"}}]' },
                }),
              );
              expect(container.items).toContainEqual(
                expectedStreamedSpan('insertMany', { [DB_OPERATION_BATCH_SIZE]: { type: 'integer', value: 2 } }),
              );
              expect(container.items).toContainEqual(
                expectedStreamedSpan('bulkWrite', { [DB_OPERATION_BATCH_SIZE]: { type: 'integer', value: 2 } }),
              );
              expect(container.items).toContainEqual(expectedStreamedSpan('find'));
            },
          })
          .start()
          .completed();
      });

      test('does not double-instrument: the legacy IITM mongoose patcher does not fire on 9.7', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const spans = container.items;
              // The monkey-patch path (origin `auto.db.mongoose`) must be inactive on 9.7+.
              expect(spans.find(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mongoose')).toBeUndefined();
              // ...while the diagnostics-channel path is active.
              expect(
                spans.find(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mongoose.diagnostic_channel'),
              ).toBeDefined();
            },
          })
          .start()
          .completed();
      });

      test('never leaks raw filter values into db.query.text', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const spans = container.items;
              for (const span of spans) {
                const queryText = span.attributes[DB_QUERY_TEXT]?.value;
                if (typeof queryText === 'string') {
                  expect(queryText).not.toContain('Test');
                }
              }
            },
          })
          .start()
          .completed();
      });

      test('nests the mongodb driver span under the mongoose channel span', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const spans = container.items;
              const mongooseSave = spans.find(
                span =>
                  span.name === 'save blogposts' &&
                  span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mongoose.diagnostic_channel',
              );
              expect(mongooseSave).toBeDefined();
              // the underlying mongodb driver span must parent to the mongoose channel span,
              // proving the channel span is the active async context for the traced operation
              const driverChild = spans.find(
                span =>
                  span.parent_span_id === mongooseSave?.span_id &&
                  span.attributes[SENTRY_ORIGIN]?.value === driverOrigin,
              );
              expect(driverChild).toBeDefined();
            },
          })
          .start()
          .completed();
      });

      test('omits db.query.text for the empty-filter cursor and does not treat the cursor batchSize as a batch', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const spans = container.items;
              // the `.find().cursor()` iteration runs with no filter, so there is no query text to emit
              const cursorFind = spans.find(
                span =>
                  span.name === 'find blogposts' &&
                  span.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mongoose.diagnostic_channel',
              );
              expect(cursorFind).toBeDefined();
              expect(cursorFind?.attributes[DB_QUERY_TEXT]).toBeUndefined();
              // a cursor's `batchSize` is a fetch-tuning option, not a batch-operation size
              expect(cursorFind?.attributes[DB_OPERATION_BATCH_SIZE]).toBeUndefined();
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongoose: '^9.7' } },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-error.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('flags the mongoose channel span as errored when the operation fails', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const aggregateSpan = container.items.find(
                item =>
                  item.name === 'aggregate blogposts' &&
                  item.attributes[SENTRY_ORIGIN]?.value === 'auto.db.mongoose.diagnostic_channel',
              );
              expect(aggregateSpan).toBeDefined();
              expect(aggregateSpan?.status).toBe('error');
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongoose: '^9.7' } },
  );
});
