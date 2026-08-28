import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('redis cache auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const redisOrigin = 'auto.db.redis';
  const redisSpanOp = 'db.query';

  describe('ioredis non-cache keys', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span',
      spans: expect.arrayContaining([
        expect.objectContaining({
          description: 'set test-key [1 other arguments]',
          op: redisSpanOp,
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.op': redisSpanOp,
            'db.system.name': 'redis',
            'server.address': 'localhost',
            'server.port': 6383,
            'db.query.text': 'set test-key [1 other arguments]',
          }),
        }),
        expect.objectContaining({
          description: 'get test-key',
          op: redisSpanOp,
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.op': redisSpanOp,
            'db.system.name': 'redis',
            'server.address': 'localhost',
            'server.port': 6383,
            'db.query.text': 'get test-key',
          }),
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument-ioredis.mjs', (createTestRunner, test) => {
      test('should not add cache spans when key is not prefixed', { timeout: 60_000 }, async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    });
  });

  describe('ioredis cache keys', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span',
      spans: expect.arrayContaining([
        // SET
        expect.objectContaining({
          description: 'ioredis-cache:test-key',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'set ioredis-cache:test-key [1 other arguments]',
            'cache.key': ['ioredis-cache:test-key'],
            'cache.item_size': 2,
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
        // SET (with EX)
        expect.objectContaining({
          description: 'ioredis-cache:test-key-set-EX',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'set ioredis-cache:test-key-set-EX [3 other arguments]',
            'cache.key': ['ioredis-cache:test-key-set-EX'],
            'cache.item_size': 2,
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
        // SETEX
        expect.objectContaining({
          description: 'ioredis-cache:test-key-setex',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'setex ioredis-cache:test-key-setex [2 other arguments]',
            'cache.key': ['ioredis-cache:test-key-setex'],
            'cache.item_size': 2,
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
        // GET
        expect.objectContaining({
          description: 'ioredis-cache:test-key',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'get ioredis-cache:test-key',
            'cache.hit': true,
            'cache.key': ['ioredis-cache:test-key'],
            'cache.item_size': 10,
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
        // GET (unavailable - no cache hit)
        expect.objectContaining({
          description: 'ioredis-cache:unavailable-data',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'get ioredis-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['ioredis-cache:unavailable-data'],
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
        // MGET
        expect.objectContaining({
          description: 'test-key, ioredis-cache:test-key, ioredis-cache:unavailable-data',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'mget [3 other arguments]',
            'cache.hit': true,
            'cache.key': ['test-key', 'ioredis-cache:test-key', 'ioredis-cache:unavailable-data'],
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
        // DEL
        expect.objectContaining({
          description: 'ioredis-cache:test-key',
          op: 'cache.remove',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'del ioredis-cache:test-key',
            'cache.key': ['ioredis-cache:test-key'],
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument-ioredis.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (ioredis)', { timeout: 60_000 }, async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });
    });
  });

  describe('redis-4 cache keys', () => {
    const EXPECTED_REDIS_CONNECT = {
      transaction: 'redis-connect',
    };

    const batchSpans = [
      expect.objectContaining({
        description: 'MULTI',
        op: 'db.query',
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.system.name': 'redis',
          'db.operation.batch.size': 2,
        }),
      }),
    ];

    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span Redis 4',
      spans: expect.arrayContaining([
        // SET
        expect.objectContaining({
          description: 'redis-cache:test-key',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'SET redis-cache:test-key [1 other arguments]',
            'cache.key': ['redis-cache:test-key'],
            'cache.item_size': 2,
          }),
        }),
        // SET (with EX)
        expect.objectContaining({
          description: 'redis-cache:test-key-set-EX',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'SET redis-cache:test-key-set-EX [3 other arguments]',
            'cache.key': ['redis-cache:test-key-set-EX'],
            'cache.item_size': 2,
          }),
        }),
        // SETEX
        expect.objectContaining({
          description: 'redis-cache:test-key-setex',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'SETEX redis-cache:test-key-setex [2 other arguments]',
            'cache.key': ['redis-cache:test-key-setex'],
            'cache.item_size': 2,
          }),
        }),
        // GET
        expect.objectContaining({
          description: 'redis-cache:test-key',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'GET redis-cache:test-key',
            'cache.hit': true,
            'cache.key': ['redis-cache:test-key'],
            'cache.item_size': 10,
          }),
        }),
        // GET (unavailable - no cache hit)
        expect.objectContaining({
          description: 'redis-cache:unavailable-data',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'GET redis-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['redis-cache:unavailable-data'],
          }),
        }),
        // MGET
        expect.objectContaining({
          description: 'redis-test-key, redis-cache:test-key, redis-cache:unavailable-data',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'MGET [3 other arguments]',
            'cache.hit': true,
            'cache.key': ['redis-test-key', 'redis-cache:test-key', 'redis-cache:unavailable-data'],
          }),
        }),
        // DEL
        expect.objectContaining({
          description: 'redis-cache:test-key',
          op: 'cache.remove',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'DEL redis-cache:test-key',
            'cache.key': ['redis-cache:test-key'],
          }),
        }),
        ...batchSpans,
        // a failing command produces a span with an error status
        expect.objectContaining({
          description: 'INCR redis-test-key',
          op: 'db.query',
          status: 'internal_error',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.system.name': 'redis',
            'db.query.text': 'INCR redis-test-key',
          }),
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-redis-4.mjs', 'instrument-redis-4.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (redis-4)', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_REDIS_CONNECT })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  // node-redis 5.0-5.11 still flows through the vendored monkey-patch
  // instrumentation (diagnostics_channel was only added in 5.12.0), so this
  // exercises the `>=5.0.0 <5.12.0` branch of the vendored RedisInstrumentation.
  describe('redis-5 cache keys', () => {
    const EXPECTED_REDIS_CONNECT = {
      transaction: 'redis-connect',
    };

    const batchSpans = [
      expect.objectContaining({
        description: 'MULTI',
        op: 'db.query',
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.system.name': 'redis',
          'db.operation.batch.size': 2,
        }),
      }),
    ];

    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span Redis 5',
      spans: expect.arrayContaining([
        // SET
        expect.objectContaining({
          description: 'redis-5-cache:test-key',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'SET redis-5-cache:test-key [1 other arguments]',
            'cache.key': ['redis-5-cache:test-key'],
            'cache.item_size': 2,
          }),
        }),
        // SET (with EX)
        expect.objectContaining({
          description: 'redis-5-cache:test-key-set-EX',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'SET redis-5-cache:test-key-set-EX [3 other arguments]',
            'cache.key': ['redis-5-cache:test-key-set-EX'],
            'cache.item_size': 2,
          }),
        }),
        // SETEX
        expect.objectContaining({
          description: 'redis-5-cache:test-key-setex',
          op: 'cache.put',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'SETEX redis-5-cache:test-key-setex [2 other arguments]',
            'cache.key': ['redis-5-cache:test-key-setex'],
            'cache.item_size': 2,
          }),
        }),
        // GET
        expect.objectContaining({
          description: 'redis-5-cache:test-key',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'GET redis-5-cache:test-key',
            'cache.hit': true,
            'cache.key': ['redis-5-cache:test-key'],
            'cache.item_size': 10,
          }),
        }),
        // GET (unavailable - no cache hit)
        expect.objectContaining({
          description: 'redis-5-cache:unavailable-data',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'GET redis-5-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['redis-5-cache:unavailable-data'],
          }),
        }),
        // MGET
        expect.objectContaining({
          description: 'redis-5-test-key, redis-5-cache:test-key, redis-5-cache:unavailable-data',
          op: 'cache.get',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'MGET [3 other arguments]',
            'cache.hit': true,
            'cache.key': ['redis-5-test-key', 'redis-5-cache:test-key', 'redis-5-cache:unavailable-data'],
          }),
        }),
        // DEL
        expect.objectContaining({
          description: 'redis-5-cache:test-key',
          op: 'cache.remove',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.query.text': 'DEL redis-5-cache:test-key',
            'cache.key': ['redis-5-cache:test-key'],
          }),
        }),
        ...batchSpans,
        // a failing command produces a span with an error status
        expect.objectContaining({
          description: 'INCR redis-5-test-key',
          op: 'db.query',
          status: 'internal_error',
          origin: redisOrigin,
          data: expect.objectContaining({
            'sentry.origin': redisOrigin,
            'db.system.name': 'redis',
            'db.query.text': 'INCR redis-5-test-key',
          }),
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-redis-5.mjs', 'instrument-redis-5.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (redis-5)', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_REDIS_CONNECT })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });
});
