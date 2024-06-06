import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('redis cache auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should not add cache spans when key is not prefixed', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span',
      spans: expect.arrayContaining([
        expect.objectContaining({
          description: 'set test-key [1 other arguments]',
          op: 'db',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.op': 'db',
            'db.system': 'redis',
            'net.peer.name': 'localhost',
            'net.peer.port': 6379,
            'db.statement': 'set test-key [1 other arguments]',
          }),
        }),
        expect.objectContaining({
          description: 'get test-key',
          op: 'db',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.op': 'db',
            'db.system': 'redis',
            'net.peer.name': 'localhost',
            'net.peer.port': 6379,
            'db.statement': 'get test-key',
          }),
        }),
      ]),
    };

    createRunner(__dirname, 'scenario-ioredis.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port=6379'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });

  test('should create cache spans for prefixed keys', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span',
      spans: expect.arrayContaining([
        // SET
        expect.objectContaining({
          description: 'ioredis-cache:test-key',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'set ioredis-cache:test-key [1 other arguments]',
            'cache.key': ['ioredis-cache:test-key'],
            'cache.item_size': 2,
            'network.peer.address': 'localhost',
            'network.peer.port': 6379,
          }),
        }),
        // GET
        expect.objectContaining({
          description: 'ioredis-cache:test-key',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'get ioredis-cache:test-key',
            'cache.hit': true,
            'cache.key': ['ioredis-cache:test-key'],
            'cache.item_size': 10,
            'network.peer.address': 'localhost',
            'network.peer.port': 6379,
          }),
        }),
        // GET (unavailable - no cache hit)
        expect.objectContaining({
          description: 'ioredis-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'get ioredis-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['ioredis-cache:unavailable-data'],
            'network.peer.address': 'localhost',
            'network.peer.port': 6379,
          }),
        }),
        // MGET
        expect.objectContaining({
          description: 'test-key, ioredis-cache:test-key, ioredis-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'mget [3 other arguments]',
            'cache.hit': true,
            'cache.key': ['test-key', 'ioredis-cache:test-key', 'ioredis-cache:unavailable-data'],
            'network.peer.address': 'localhost',
            'network.peer.port': 6379,
          }),
        }),
      ]),
    };

    createRunner(__dirname, 'scenario-ioredis.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port=6379'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });
});
