import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// mongoose >= 9.7.0 publishes its operations via `node:diagnostics_channel`, so the SDK subscribes
// to those channels (`subscribeMongooseDiagnosticChannels`) instead of monkey-patching. This suite
// pins `^9.7` and asserts the diagnostics-channel path: stable OTel DB semconv attributes, redacted
// query text, span relationships, and that the legacy IITM patcher does NOT also fire (no double
// instrumentation). mongoose 9 requires Node >=20.19, so this suite is skipped on older Node.
conditionalTest({ min: 20 })('Mongoose tracing channel Test', () => {
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

  const expectedSpan = (operation: string, extraData: Record<string, unknown> = {}) =>
    expect.objectContaining({
      data: expect.objectContaining({
        'db.system.name': 'mongodb',
        'db.namespace': 'test',
        'db.collection.name': 'blogposts',
        'db.operation.name': operation,
        'server.address': expect.any(String),
        'server.port': expect.any(Number),
        ...extraData,
      }),
      description: `mongoose.blogposts.${operation}`,
      op: 'db',
      origin: 'auto.db.mongoose.diagnostic_channel',
    });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expectedSpan('save'),
      // filter values are redacted out of `db.query.text`
      expectedSpan('findOne', { 'db.query.text': '{"title":"?"}' }),
      expectedSpan('aggregate', { 'db.query.text': '[{"$match":{"title":"?"}}]' }),
      expectedSpan('insertMany', { 'db.operation.batch.size': 2 }),
      expectedSpan('bulkWrite', { 'db.operation.batch.size': 2 }),
      // a cursor iteration emits a span per `.next()` via the `mongoose:cursor:next` channel
      expectedSpan('find'),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('subscribes to mongoose >= 9.7 diagnostics channels with stable semconv attributes', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });

      test('does not double-instrument: the legacy IITM mongoose patcher does not fire on 9.7', async () => {
        await createTestRunner()
          .expect({
            transaction: event => {
              const spans = event.spans || [];
              // The monkey-patch path (origin `auto.db.otel.mongoose`) must be inactive on 9.7+.
              expect(spans.find(span => span.origin === 'auto.db.otel.mongoose')).toBeUndefined();
              // ...while the diagnostics-channel path is active.
              expect(spans.find(span => span.origin === 'auto.db.mongoose.diagnostic_channel')).toBeDefined();
            },
          })
          .start()
          .completed();
      });

      test('never leaks raw filter values into db.query.text', async () => {
        await createTestRunner()
          .expect({
            transaction: event => {
              const spans = event.spans || [];
              for (const span of spans) {
                const queryText = span.data?.['db.query.text'];
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
            transaction: event => {
              const spans = event.spans || [];
              const mongooseSave = spans.find(span => span.description === 'mongoose.blogposts.save');
              expect(mongooseSave).toBeDefined();
              // the underlying mongodb driver span must parent to the mongoose channel span,
              // proving the channel span is the active async context for the traced operation
              const driverChild = spans.find(
                span => span.parent_span_id === mongooseSave?.span_id && span.origin === 'auto.db.otel.mongo',
              );
              expect(driverChild).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { mongoose: '^9.7' } },
  );
});
