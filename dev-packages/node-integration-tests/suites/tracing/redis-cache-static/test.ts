import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('redis cache static instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const redisOrigin = 'auto.db.redis';

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Span',
    spans: expect.arrayContaining([
      // SET
      expect.objectContaining({
        description: 'ioredis-cache:test-key',
        op: CACHE_PUT,
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.query.text': 'set ioredis-cache:test-key [1 other arguments]',
          'cache.operation': 'put',
          'cache.key': ['ioredis-cache:test-key'],
          'cache.item_size': 2,
          'network.peer.address': 'localhost',
          'network.peer.port': 6384,
        }),
      }),
      // SET (with EX)
      expect.objectContaining({
        description: 'ioredis-cache:test-key-set-EX',
        op: CACHE_PUT,
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.query.text': 'set ioredis-cache:test-key-set-EX [3 other arguments]',
          'cache.operation': 'put',
          'cache.key': ['ioredis-cache:test-key-set-EX'],
          'cache.item_size': 2,
          'network.peer.address': 'localhost',
          'network.peer.port': 6384,
        }),
      }),
      // SETEX
      expect.objectContaining({
        description: 'ioredis-cache:test-key-setex',
        op: CACHE_PUT,
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.query.text': 'setex ioredis-cache:test-key-setex [2 other arguments]',
          'cache.operation': 'put',
          'cache.key': ['ioredis-cache:test-key-setex'],
          'cache.item_size': 2,
          'network.peer.address': 'localhost',
          'network.peer.port': 6384,
        }),
      }),
      // GET
      expect.objectContaining({
        description: 'ioredis-cache:test-key',
        op: CACHE_GET,
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.query.text': 'get ioredis-cache:test-key',
          'cache.operation': 'get',
          'cache.hit': true,
          'cache.key': ['ioredis-cache:test-key'],
          'cache.item_size': 10,
          'network.peer.address': 'localhost',
          'network.peer.port': 6384,
        }),
      }),
      // GET (unavailable - no cache hit)
      expect.objectContaining({
        description: 'ioredis-cache:unavailable-data',
        op: CACHE_GET,
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.query.text': 'get ioredis-cache:unavailable-data',
          'cache.operation': 'get',
          'cache.hit': false,
          'cache.key': ['ioredis-cache:unavailable-data'],
          'network.peer.address': 'localhost',
          'network.peer.port': 6384,
        }),
      }),
      // MGET
      expect.objectContaining({
        description: 'test-key, ioredis-cache:test-key, ioredis-cache:unavailable-data',
        op: CACHE_GET,
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.query.text': 'mget [3 other arguments]',
          'cache.operation': 'get',
          'cache.hit': true,
          'cache.key': ['test-key', 'ioredis-cache:test-key', 'ioredis-cache:unavailable-data'],
          'network.peer.address': 'localhost',
          'network.peer.port': 6384,
        }),
      }),
      // DEL
      expect.objectContaining({
        description: 'ioredis-cache:test-key',
        op: CACHE_REMOVE,
        origin: redisOrigin,
        data: expect.objectContaining({
          'sentry.origin': redisOrigin,
          'db.query.text': 'del ioredis-cache:test-key',
          'cache.operation': 'remove',
          'cache.key': ['ioredis-cache:test-key'],
          'network.peer.address': 'localhost',
          'network.peer.port': 6384,
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
