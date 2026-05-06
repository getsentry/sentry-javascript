import type { TransactionEvent } from '@sentry/core';
import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { assertSentryTransaction } from '../../../utils/assertions';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

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

  test('CJS - should auto-instrument `mongodb` package.', async () => {
    await createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: (txn: TransactionEvent) => {
          assertSentryTransaction(txn, { transaction: 'Test Transaction' });
          const spans = txn.spans || [];
          expect(spans).toHaveLength(8);

          expect(spans).toContainEqual(SPAN_FIND_MATCHER);
          expect(spans).toContainEqual(SPAN_INSERT_MATCHER);
          expect(spans).toContainEqual(SPAN_ISMASTER_MATCHER);
          expect(spans).toContainEqual(SPAN_UPDATE_MATCHER);
          expect(spans).toContainEqual(SPAN_ENDSESSIONS_MATCHER);

          // Ensure duplicate spans are correctly there
          const findSpans = spans.filter(span => span.data['db.operation'] === 'find');
          expect(findSpans).toHaveLength(3);

          const isMasterSpans = spans.filter(span => span.data['db.operation'] === 'isMaster');
          expect(isMasterSpans).toHaveLength(2);
        },
      })
      .start()
      .completed();
  });
});
