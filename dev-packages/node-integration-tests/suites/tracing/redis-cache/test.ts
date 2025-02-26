import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('redis cache auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should not add cache spans when key is not prefixed', { timeout: 60_000 }, async () => {
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

    await createRunner(__dirname, 'scenario-ioredis.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port=6379'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should create cache spans for prefixed keys (ioredis)', { timeout: 60_000 }, async () => {
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

    await createRunner(__dirname, 'scenario-ioredis.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port=6379'] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should create cache spans for prefixed keys (redis-4)', async () => {
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
      ]),
    };

    await createRunner(__dirname, 'scenario-redis-4.js')
      .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port=6379'] })
      .expect({ transaction: EXPECTED_REDIS_CONNECT })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });
});
