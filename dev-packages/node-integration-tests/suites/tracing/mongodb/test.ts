import { MongoMemoryServer } from 'mongodb-memory-server-global';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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

  /**
   * Assert the operations we run in `scenario.js` are present. We intentionally
   * do not match the full span list: wire-protocol handshakes (`isMaster` vs
   * `hello`) and session cleanup vary by driver / server and are a common
   * source of flakes in CI (see https://github.com/getsentry/sentry-javascript/issues/20424).
   */
  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
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
        }),
        description: '{"title":"?","_id":{"_bsontype":"?","id":"?"}}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
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
        }),
        description: '{"title":"?"}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
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
        }),
        description: '{"title":"?"}',
        op: 'db',
        origin: 'auto.db.otel.mongo',
      }),
    ]),
  };

  test('CJS - should auto-instrument `mongodb` package.', async () => {
    await createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
  });
});
