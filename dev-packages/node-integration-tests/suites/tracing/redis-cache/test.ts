import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('redis cache auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('ioredis non-cache keys', () => {
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

    createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument-ioredis.mjs', (createTestRunner, test) => {
      test('should not add cache spans when key is not prefixed', { timeout: 60_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({ workingDirectory: [__dirname] })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
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
        // SET (with EX)
        expect.objectContaining({
          description: 'ioredis-cache:test-key-set-EX',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'set ioredis-cache:test-key-set-EX [3 other arguments]',
            'cache.key': ['ioredis-cache:test-key-set-EX'],
            'cache.item_size': 2,
            'network.peer.address': 'localhost',
            'network.peer.port': 6379,
          }),
        }),
        // SETEX
        expect.objectContaining({
          description: 'ioredis-cache:test-key-setex',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'setex ioredis-cache:test-key-setex [2 other arguments]',
            'cache.key': ['ioredis-cache:test-key-setex'],
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

    createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument-ioredis.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (ioredis)', { timeout: 60_000 }, async () => {
        await createTestRunner()
          .withDockerCompose({ workingDirectory: [__dirname] })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  describe('redis-4 cache keys', () => {
    const EXPECTED_REDIS_CONNECT = {
      transaction: 'redis-connect',
    };

    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span Redis 4',
      spans: expect.arrayContaining([
        // SET
        expect.objectContaining({
          description: 'redis-cache:test-key',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SET redis-cache:test-key [1 other arguments]',
            'cache.key': ['redis-cache:test-key'],
            'cache.item_size': 2,
          }),
        }),
        // SET (with EX)
        expect.objectContaining({
          description: 'redis-cache:test-key-set-EX',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SET redis-cache:test-key-set-EX [3 other arguments]',
            'cache.key': ['redis-cache:test-key-set-EX'],
            'cache.item_size': 2,
          }),
        }),
        // SETEX
        expect.objectContaining({
          description: 'redis-cache:test-key-setex',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SETEX redis-cache:test-key-setex [2 other arguments]',
            'cache.key': ['redis-cache:test-key-setex'],
            'cache.item_size': 2,
          }),
        }),
        // GET
        expect.objectContaining({
          description: 'redis-cache:test-key',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'GET redis-cache:test-key',
            'cache.hit': true,
            'cache.key': ['redis-cache:test-key'],
            'cache.item_size': 10,
          }),
        }),
        // GET (unavailable - no cache hit)
        expect.objectContaining({
          description: 'redis-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'GET redis-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['redis-cache:unavailable-data'],
          }),
        }),
        // MGET
        expect.objectContaining({
          description: 'redis-test-key, redis-cache:test-key, redis-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'MGET [3 other arguments]',
            'cache.hit': true,
            'cache.key': ['redis-test-key', 'redis-cache:test-key', 'redis-cache:unavailable-data'],
          }),
        }),
        // a failing command produces a span with an error status
        expect.objectContaining({
          description: 'INCR redis-test-key',
          op: 'db',
          status: 'internal_error',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.system': 'redis',
            'db.statement': 'INCR redis-test-key',
          }),
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-redis-4.mjs', 'instrument-redis-4.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (redis-4)', async () => {
        await createTestRunner()
          .withDockerCompose({ workingDirectory: [__dirname] })
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

    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span Redis 5',
      spans: expect.arrayContaining([
        // SET
        expect.objectContaining({
          description: 'redis-5-cache:test-key',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SET redis-5-cache:test-key [1 other arguments]',
            'cache.key': ['redis-5-cache:test-key'],
            'cache.item_size': 2,
          }),
        }),
        // SET (with EX)
        expect.objectContaining({
          description: 'redis-5-cache:test-key-set-EX',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SET redis-5-cache:test-key-set-EX [3 other arguments]',
            'cache.key': ['redis-5-cache:test-key-set-EX'],
            'cache.item_size': 2,
          }),
        }),
        // SETEX
        expect.objectContaining({
          description: 'redis-5-cache:test-key-setex',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SETEX redis-5-cache:test-key-setex [2 other arguments]',
            'cache.key': ['redis-5-cache:test-key-setex'],
            'cache.item_size': 2,
          }),
        }),
        // GET
        expect.objectContaining({
          description: 'redis-5-cache:test-key',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'GET redis-5-cache:test-key',
            'cache.hit': true,
            'cache.key': ['redis-5-cache:test-key'],
            'cache.item_size': 10,
          }),
        }),
        // GET (unavailable - no cache hit)
        expect.objectContaining({
          description: 'redis-5-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'GET redis-5-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['redis-5-cache:unavailable-data'],
          }),
        }),
        // MGET
        expect.objectContaining({
          description: 'redis-5-test-key, redis-5-cache:test-key, redis-5-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'MGET [3 other arguments]',
            'cache.hit': true,
            'cache.key': ['redis-5-test-key', 'redis-5-cache:test-key', 'redis-5-cache:unavailable-data'],
          }),
        }),
        // a failing command produces a span with an error status
        expect.objectContaining({
          description: 'INCR redis-5-test-key',
          op: 'db',
          status: 'internal_error',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.system': 'redis',
            'db.statement': 'INCR redis-5-test-key',
          }),
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-redis-5.mjs', 'instrument-redis-5.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (redis-5)', async () => {
        await createTestRunner()
          .withDockerCompose({ workingDirectory: [__dirname] })
          .expect({ transaction: EXPECTED_REDIS_CONNECT })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });
});
