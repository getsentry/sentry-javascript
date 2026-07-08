import type { TransactionEvent } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { assertSentryTransaction } from '../../../utils/assertions';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('MongoDB auto-instrumentation', () => {
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

  const SPAN_FIND_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': 'auto.db.otel.mongo',
      'sentry.op': 'db',
      'db.system': 'mongodb',
      'db.name': 'admin',
      'db.mongodb.collection': 'movies',
      'db.operation': 'find',
      'db.connection_string': expect.any(String),
      'net.peer.name': expect.any(String),
      'net.peer.port': expect.any(Number),
      'db.statement': '{"title":"?"}',
      'otel.kind': 'CLIENT',
    },
    description: '{"title":"?"}',
    op: 'db',
    origin: 'auto.db.otel.mongo',
  });

  const SPAN_INSERT_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': 'auto.db.otel.mongo',
      'sentry.op': 'db',
      'db.system': 'mongodb',
      'db.name': 'admin',
      'db.mongodb.collection': 'movies',
      'db.operation': 'insert',
      'db.connection_string': expect.any(String),
      'net.peer.name': expect.any(String),
      'net.peer.port': expect.any(Number),
      'db.statement': '{"title":"?","_id":{"_bsontype":"?","id":"?"}}',
      'otel.kind': 'CLIENT',
    },
    description: '{"title":"?","_id":{"_bsontype":"?","id":"?"}}',
    op: 'db',
    origin: 'auto.db.otel.mongo',
  });

  const SPAN_ISMASTER_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': 'auto.db.otel.mongo',
      'sentry.op': 'db',
      'db.system': 'mongodb',
      'db.name': 'admin',
      'db.mongodb.collection': '$cmd',
      'db.operation': 'isMaster',
      'db.connection_string': expect.any(String),
      'net.peer.name': expect.any(String),
      'net.peer.port': expect.any(Number),
      'db.statement':
        '{"ismaster":"?","client":{"driver":{"name":"?","version":"?"},"os":{"type":"?","name":"?","architecture":"?","version":"?"},"platform":"?"},"compression":[],"helloOk":"?"}',
      'otel.kind': 'CLIENT',
    },
    description:
      '{"ismaster":"?","client":{"driver":{"name":"?","version":"?"},"os":{"type":"?","name":"?","architecture":"?","version":"?"},"platform":"?"},"compression":[],"helloOk":"?"}',
    op: 'db',
    origin: 'auto.db.otel.mongo',
  });

  const SPAN_UPDATE_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': 'auto.db.otel.mongo',
      'sentry.op': 'db',
      'db.system': 'mongodb',
      'db.name': 'admin',
      'db.mongodb.collection': 'movies',
      'db.operation': 'update',
      'db.connection_string': expect.any(String),
      'net.peer.name': expect.any(String),
      'net.peer.port': expect.any(Number),
      'db.statement': '{"title":"?"}',
      'otel.kind': 'CLIENT',
    },
    description: '{"title":"?"}',
    op: 'db',
    origin: 'auto.db.otel.mongo',
  });

  // A query the server rejects: same attributes as a successful find, but with an error status.
  const SPAN_FIND_ERROR_MATCHER = expect.objectContaining({
    data: expect.objectContaining({
      'sentry.origin': 'auto.db.otel.mongo',
      'sentry.op': 'db',
      'db.system': 'mongodb',
      'db.operation': 'find',
      'db.statement': '{"$thisOperatorDoesNotExist":"?"}',
      'otel.kind': 'CLIENT',
    }),
    description: '{"$thisOperatorDoesNotExist":"?"}',
    op: 'db',
    origin: 'auto.db.otel.mongo',
    status: 'internal_error',
  });

  const SPAN_ENDSESSIONS_MATCHER = expect.objectContaining({
    data: {
      'sentry.origin': 'auto.db.otel.mongo',
      'sentry.op': 'db',
      'db.system': 'mongodb',
      'db.name': 'admin',
      'db.mongodb.collection': '$cmd',
      'db.connection_string': expect.any(String),
      'net.peer.name': expect.any(String),
      'net.peer.port': expect.any(Number),
      'db.statement': '{"endSessions":[{"id":{"_bsontype":"?","sub_type":"?","position":"?","buffer":"?"}}]}',
      'otel.kind': 'CLIENT',
    },
    description: '{"endSessions":[{"id":{"_bsontype":"?","sub_type":"?","position":"?","buffer":"?"}}]}',
    op: 'db',
    origin: 'auto.db.otel.mongo',
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('should auto-instrument `mongodb` package.', async () => {
      await createTestRunner()
        .expect({
          transaction: (txn: TransactionEvent) => {
            assertSentryTransaction(txn, { transaction: 'Test Transaction' });
            const spans = txn.spans || [];

            // Assert the per-operation breakdown rather than just a total span
            // count. When the driver occasionally emits an extra command
            // (e.g. a stray `isMaster` from a reconnect, a `ping`, or a
            // heartbeat), `toEqual` shows a clear per-operation diff like
            // "isMaster: 2 → 3" instead of an opaque "8 vs 9" length
            // mismatch — making future flakes self-diagnosing.
            //
            // `db.operation` isn't set on every span — the `endSessions`
            // command exposes its name only via `db.statement` — so derive
            // the operation by parsing the leading command name out of
            // `db.statement` as a fallback.
            const operationCounts = spans.reduce<Record<string, number>>((acc, span) => {
              const data = (span.data ?? {}) as Record<string, unknown>;
              let op = typeof data['db.operation'] === 'string' ? (data['db.operation'] as string) : undefined;
              if (!op) {
                const stmt = data['db.statement'];
                const match = typeof stmt === 'string' ? stmt.match(/^\{"(\w+)"/) : null;
                op = match ? match[1] : 'unknown';
              }
              acc[op] = (acc[op] || 0) + 1;
              return acc;
            }, {});

            expect(operationCounts).toEqual({
              find: 4,
              isMaster: 2,
              insert: 1,
              update: 1,
              endSessions: 1,
            });

            expect(spans).toContainEqual(SPAN_FIND_MATCHER);
            expect(spans).toContainEqual(SPAN_INSERT_MATCHER);
            expect(spans).toContainEqual(SPAN_ISMASTER_MATCHER);
            expect(spans).toContainEqual(SPAN_UPDATE_MATCHER);
            expect(spans).toContainEqual(SPAN_FIND_ERROR_MATCHER);
            expect(spans).toContainEqual(SPAN_ENDSESSIONS_MATCHER);
          },
        })
        .start()
        .completed();
    });
  });
});
