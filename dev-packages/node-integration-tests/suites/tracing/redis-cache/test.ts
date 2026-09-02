import { SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
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
            'cache.operation': 'put',
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
            'cache.operation': 'put',
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
            'cache.operation': 'put',
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
            'cache.operation': 'get',
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
            'cache.operation': 'get',
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
            'cache.operation': 'get',
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
            'cache.operation': 'remove',
            'cache.key': ['ioredis-cache:test-key'],
            'network.peer.address': 'localhost',
            'network.peer.port': 6383,
          }),
        }),
      ]),
    };

    // Same commands as above, but streamed: the cache key is gone from the span name and only
    // `cache.key` still holds it.
    const EXPECTED_STREAMED_SPANS = expect.arrayContaining([
      // SET
      expect.objectContaining({
        name: 'cache.put',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.put' },
          'db.query.text': { type: 'string', value: 'set ioredis-cache:test-key [1 other arguments]' },
          'cache.operation': { type: 'string', value: 'put' },
          'cache.key': { type: 'array', value: ['ioredis-cache:test-key'] },
          'cache.item_size': { type: 'integer', value: 2 },
        }),
      }),
      // SETEX
      expect.objectContaining({
        name: 'cache.put',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'cache.put' },
          'db.query.text': { type: 'string', value: 'setex ioredis-cache:test-key-setex [2 other arguments]' },
          'cache.operation': { type: 'string', value: 'put' },
          'cache.key': { type: 'array', value: ['ioredis-cache:test-key-setex'] },
        }),
      }),
      // GET
      expect.objectContaining({
        name: 'cache.get',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.get' },
          'db.query.text': { type: 'string', value: 'get ioredis-cache:test-key' },
          'cache.operation': { type: 'string', value: 'get' },
          'cache.hit': { type: 'boolean', value: true },
          'cache.key': { type: 'array', value: ['ioredis-cache:test-key'] },
          'cache.item_size': { type: 'integer', value: 10 },
        }),
      }),
      // MGET
      expect.objectContaining({
        name: 'cache.get',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'cache.get' },
          'db.query.text': { type: 'string', value: 'mget [3 other arguments]' },
          'cache.operation': { type: 'string', value: 'get' },
          'cache.key': {
            type: 'array',
            value: ['test-key', 'ioredis-cache:test-key', 'ioredis-cache:unavailable-data'],
          },
        }),
      }),
      // DEL
      expect.objectContaining({
        name: 'cache.remove',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.remove' },
          'db.query.text': { type: 'string', value: 'del ioredis-cache:test-key' },
          'cache.operation': { type: 'string', value: 'remove' },
          'cache.key': { type: 'array', value: ['ioredis-cache:test-key'] },
        }),
      }),
    ]);

    createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument-ioredis.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (ioredis)', { timeout: 60_000 }, async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });

      test('should name cache spans after the cache operation when streamed (ioredis)', async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          .expect({ span: { items: EXPECTED_STREAMED_SPANS } })
          .start()
          .completed();
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
            'cache.operation': 'put',
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
            'cache.operation': 'put',
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
            'cache.operation': 'put',
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
            'cache.operation': 'get',
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
            'cache.operation': 'get',
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
            'cache.operation': 'get',
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
            'cache.operation': 'remove',
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

    const EXPECTED_STREAMED_SPANS = expect.arrayContaining([
      // SET
      expect.objectContaining({
        name: 'cache.put',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.put' },
          'db.query.text': { type: 'string', value: 'SET redis-cache:test-key [1 other arguments]' },
          'cache.operation': { type: 'string', value: 'put' },
          'cache.key': { type: 'array', value: ['redis-cache:test-key'] },
          'cache.item_size': { type: 'integer', value: 2 },
        }),
      }),
      // SETEX
      expect.objectContaining({
        name: 'cache.put',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'cache.put' },
          'db.query.text': { type: 'string', value: 'SETEX redis-cache:test-key-setex [2 other arguments]' },
          'cache.operation': { type: 'string', value: 'put' },
          'cache.key': { type: 'array', value: ['redis-cache:test-key-setex'] },
        }),
      }),
      // GET
      expect.objectContaining({
        name: 'cache.get',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.get' },
          'db.query.text': { type: 'string', value: 'GET redis-cache:test-key' },
          'cache.operation': { type: 'string', value: 'get' },
          'cache.hit': { type: 'boolean', value: true },
          'cache.key': { type: 'array', value: ['redis-cache:test-key'] },
          'cache.item_size': { type: 'integer', value: 10 },
        }),
      }),
      // MGET
      expect.objectContaining({
        name: 'cache.get',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'cache.get' },
          'db.query.text': { type: 'string', value: 'MGET [3 other arguments]' },
          'cache.operation': { type: 'string', value: 'get' },
          'cache.key': {
            type: 'array',
            value: ['redis-test-key', 'redis-cache:test-key', 'redis-cache:unavailable-data'],
          },
        }),
      }),
      // DEL
      expect.objectContaining({
        name: 'cache.remove',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.remove' },
          'db.query.text': { type: 'string', value: 'DEL redis-cache:test-key' },
          'cache.operation': { type: 'string', value: 'remove' },
          'cache.key': { type: 'array', value: ['redis-cache:test-key'] },
        }),
      }),
    ]);

    createEsmAndCjsTests(__dirname, 'scenario-redis-4.mjs', 'instrument-redis-4.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (redis-4)', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_REDIS_CONNECT })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });

      test('should name cache spans after the cache operation when streamed (redis-4)', async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          // The connect span is streamed in its own envelope, ahead of the command spans.
          .unordered()
          .expect({ span: { items: EXPECTED_STREAMED_SPANS } })
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
            'cache.operation': 'put',
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
            'cache.operation': 'put',
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
            'cache.operation': 'put',
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
            'cache.operation': 'get',
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
            'cache.operation': 'get',
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
            'cache.operation': 'get',
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
            'cache.operation': 'remove',
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

    const EXPECTED_STREAMED_SPANS = expect.arrayContaining([
      // SET
      expect.objectContaining({
        name: 'cache.put',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.put' },
          'db.query.text': { type: 'string', value: 'SET redis-5-cache:test-key [1 other arguments]' },
          'cache.operation': { type: 'string', value: 'put' },
          'cache.key': { type: 'array', value: ['redis-5-cache:test-key'] },
          'cache.item_size': { type: 'integer', value: 2 },
        }),
      }),
      // SETEX
      expect.objectContaining({
        name: 'cache.put',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'cache.put' },
          'db.query.text': { type: 'string', value: 'SETEX redis-5-cache:test-key-setex [2 other arguments]' },
          'cache.operation': { type: 'string', value: 'put' },
          'cache.key': { type: 'array', value: ['redis-5-cache:test-key-setex'] },
        }),
      }),
      // GET
      expect.objectContaining({
        name: 'cache.get',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.get' },
          'db.query.text': { type: 'string', value: 'GET redis-5-cache:test-key' },
          'cache.operation': { type: 'string', value: 'get' },
          'cache.hit': { type: 'boolean', value: true },
          'cache.key': { type: 'array', value: ['redis-5-cache:test-key'] },
          'cache.item_size': { type: 'integer', value: 10 },
        }),
      }),
      // MGET
      expect.objectContaining({
        name: 'cache.get',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'cache.get' },
          'db.query.text': { type: 'string', value: 'MGET [3 other arguments]' },
          'cache.operation': { type: 'string', value: 'get' },
          'cache.key': {
            type: 'array',
            value: ['redis-5-test-key', 'redis-5-cache:test-key', 'redis-5-cache:unavailable-data'],
          },
        }),
      }),
      // DEL
      expect.objectContaining({
        name: 'cache.remove',
        is_segment: false,
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: redisOrigin },
          'sentry.op': { type: 'string', value: 'cache.remove' },
          'db.query.text': { type: 'string', value: 'DEL redis-5-cache:test-key' },
          'cache.operation': { type: 'string', value: 'remove' },
          'cache.key': { type: 'array', value: ['redis-5-cache:test-key'] },
        }),
      }),
    ]);

    createEsmAndCjsTests(__dirname, 'scenario-redis-5.mjs', 'instrument-redis-5.mjs', (createTestRunner, test) => {
      test('should create cache spans for prefixed keys (redis-5)', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_REDIS_CONNECT })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });

      test('should name cache spans after the cache operation when streamed (redis-5)', async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          // The connect span is streamed in its own envelope, ahead of the command spans.
          .unordered()
          .expect({ span: { items: EXPECTED_STREAMED_SPANS } })
          .start()
          .completed();
      });
    });
  });

  describe('streamed', () => {
    // The blocks above assert the same commands as transactions. With span streaming, span names
    // have to be low cardinality, so `db.query` spans drop the serialized statement from their
    // name — it stays on `db.query.text` — and are named
    // `{db.operation.name} {server.address}:{server.port}` instead. Cache spans are named after
    // their cache operation, and batch spans keep their `MULTI`/`PIPELINE` name.
    const streamAttribute = (value: unknown): { type: string; value: unknown } => ({
      type: Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value,
      value,
    });

    // Streamed spans carry `{ type, value }` attribute pairs; the expectations below are written
    // as plain values and wrapped here.
    const streamAttributes = (values: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, streamAttribute(value)]));

    const commonAttributes = (segmentName: string): Record<string, unknown> => ({
      ...streamAttributes({
        'db.system.name': 'redis',
        'sentry.environment': 'production',
        'sentry.kind': 'client',
        'sentry.origin': redisOrigin,
        'sentry.release': '1.0',
        'sentry.sdk.name': 'sentry.javascript.node',
        'sentry.segment.name': segmentName,
        [SENTRY_TRACE_LIFECYCLE]: 'stream',
      }),
      'sentry.sdk.version': { type: 'string', value: expect.any(String) },
      'sentry.segment.id': { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
    });

    function streamedSpan({
      name,
      op,
      segmentName,
      status = 'ok',
      attributes,
    }: {
      name: string;
      op: string;
      segmentName: string;
      status?: string;
      attributes: Record<string, unknown>;
    }): unknown {
      return {
        name,
        attributes: {
          ...commonAttributes(segmentName),
          ...streamAttributes({ 'sentry.op': op, ...attributes }),
        },
        end_timestamp: expect.any(Number),
        is_segment: false,
        parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status,
        trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      };
    }

    const childSpans = (container: SerializedStreamedSpanContainer): SerializedStreamedSpanContainer['items'] =>
      container.items.filter(item => !item.is_segment);

    describe('ioredis', () => {
      const segmentName = 'Test Span';
      const connection = { 'server.address': 'localhost', 'server.port': 6383 };
      const peer = { 'network.peer.address': 'localhost', 'network.peer.port': 6383 };

      const span = (name: string, op: string, attributes: Record<string, unknown>, status?: string): unknown =>
        streamedSpan({ name, op, segmentName, status, attributes: { ...connection, ...attributes } });

      // A cache span is a db span the cache hook took over: it is renamed to its cache operation
      // and reports the connection it inherited as peer attributes too.
      const cacheSpan = (
        op: 'cache.get' | 'cache.put' | 'cache.remove',
        attributes: Record<string, unknown>,
      ): unknown => span(op, op, { ...peer, 'cache.operation': op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument-ioredis.mjs', (createTestRunner, test) => {
        test('creates streamed db and cache spans (ioredis)', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .withEnv({ STREAMED: 'true' })
            .expect({
              span: (container: SerializedStreamedSpanContainer) => {
                expect(container.items.find(item => item.is_segment)?.name).toBe(segmentName);

                expect(childSpans(container)).toEqual([
                  span('set localhost:6383', redisSpanOp, {
                    'db.operation.name': 'set',
                    'db.query.text': 'set test-key [1 other arguments]',
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'set',
                    'db.query.text': 'set ioredis-cache:test-key [1 other arguments]',
                    'cache.key': ['ioredis-cache:test-key'],
                    'cache.item_size': 2,
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'set',
                    'db.query.text': 'set ioredis-cache:test-key-set-EX [3 other arguments]',
                    'cache.key': ['ioredis-cache:test-key-set-EX'],
                    'cache.item_size': 2,
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'setex',
                    'db.query.text': 'setex ioredis-cache:test-key-setex [2 other arguments]',
                    'cache.key': ['ioredis-cache:test-key-setex'],
                    'cache.item_size': 2,
                  }),
                  span('get localhost:6383', redisSpanOp, {
                    'db.operation.name': 'get',
                    'db.query.text': 'get test-key',
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'get',
                    'db.query.text': 'get ioredis-cache:test-key',
                    'cache.key': ['ioredis-cache:test-key'],
                    'cache.hit': true,
                    'cache.item_size': 10,
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'get',
                    'db.query.text': 'get ioredis-cache:unavailable-data',
                    'cache.key': ['ioredis-cache:unavailable-data'],
                    'cache.hit': false,
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'mget',
                    'db.query.text': 'mget [3 other arguments]',
                    'cache.key': ['test-key', 'ioredis-cache:test-key', 'ioredis-cache:unavailable-data'],
                    'cache.hit': true,
                    'cache.item_size': 20,
                  }),
                  cacheSpan('cache.remove', {
                    'db.operation.name': 'del',
                    'db.query.text': 'del ioredis-cache:test-key',
                    'cache.key': ['ioredis-cache:test-key'],
                  }),
                ]);
              },
            })
            .start()
            .completed();
        });
      });
    });

    // node-redis v4 fills in `socket.host`, so its `db.query` spans get the
    // `{db.operation.name} {server.address}:{server.port}` name.
    describe('redis-4', () => {
      const segmentName = 'Test Span Redis 4';
      const connection = { 'server.address': 'localhost', 'server.port': 6383 };
      const peer = { 'network.peer.address': 'localhost', 'network.peer.port': 6383 };

      const span = (name: string, op: string, attributes: Record<string, unknown>, status?: string): unknown =>
        streamedSpan({ name, op, segmentName, status, attributes: { ...connection, ...attributes } });

      // A cache span is a db span the cache hook took over: it is renamed to its cache operation
      // and reports the connection it inherited as peer attributes too.
      const cacheSpan = (
        op: 'cache.get' | 'cache.put' | 'cache.remove',
        attributes: Record<string, unknown>,
      ): unknown => span(op, op, { ...peer, 'cache.operation': op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-redis-4.mjs', 'instrument-redis-4.mjs', (createTestRunner, test) => {
        test('creates streamed db and cache spans (redis-4)', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .withEnv({ STREAMED: 'true' })
            .expect({
              span: (container: SerializedStreamedSpanContainer) => {
                // The connect span opens its own segment, but shares the trace with the test span,
                // so both segments arrive in the same container.
                expect(container.items.filter(item => item.is_segment).map(item => item.name)).toEqual([
                  'redis-connect',
                  segmentName,
                ]);

                expect(childSpans(container)).toEqual([
                  span('SET localhost:6383', redisSpanOp, {
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET redis-test-key [1 other arguments]',
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET redis-cache:test-key [1 other arguments]',
                    'cache.key': ['redis-cache:test-key'],
                    'cache.item_size': 2,
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET redis-cache:test-key-set-EX [3 other arguments]',
                    'cache.key': ['redis-cache:test-key-set-EX'],
                    'cache.item_size': 2,
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'SETEX',
                    'db.query.text': 'SETEX redis-cache:test-key-setex [2 other arguments]',
                    'cache.key': ['redis-cache:test-key-setex'],
                    'cache.item_size': 2,
                  }),
                  span('GET localhost:6383', redisSpanOp, {
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET redis-test-key',
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET redis-cache:test-key',
                    'cache.key': ['redis-cache:test-key'],
                    'cache.hit': true,
                    'cache.item_size': 10,
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET redis-cache:unavailable-data',
                    'cache.key': ['redis-cache:unavailable-data'],
                    'cache.hit': false,
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'MGET',
                    'db.query.text': 'MGET [3 other arguments]',
                    'cache.key': ['redis-test-key', 'redis-cache:test-key', 'redis-cache:unavailable-data'],
                    'cache.hit': true,
                    'cache.item_size': 20,
                  }),
                  cacheSpan('cache.remove', {
                    'db.operation.name': 'DEL',
                    'db.query.text': 'DEL redis-cache:test-key',
                    'cache.key': ['redis-cache:test-key'],
                  }),
                  // Batch spans are named after the batch operation, which is already low cardinality.
                  span('MULTI', redisSpanOp, { 'db.operation.name': 'MULTI', 'db.operation.batch.size': 2 }),
                  span(
                    'INCR localhost:6383',
                    redisSpanOp,
                    {
                      'db.operation.name': 'INCR',
                      'db.query.text': 'INCR redis-test-key',
                      'error.type': 'Error',
                      'sentry.status.message': 'ERR value is not an integer or out of range',
                    },
                    'error',
                  ),
                ]);
              },
            })
            .start()
            .completed();
        });
      });
    });

    // node-redis v5 leaves `socket.host` unset when only a port is passed, unlike v4. The
    // integration fills in the library's own `localhost` default, so both report the same
    // connection and get the same span name.
    describe('redis-5', () => {
      const segmentName = 'Test Span Redis 5';
      const connection = { 'server.address': 'localhost', 'server.port': 6383 };
      const peer = { 'network.peer.address': 'localhost', 'network.peer.port': 6383 };

      const span = (name: string, op: string, attributes: Record<string, unknown>, status?: string): unknown =>
        streamedSpan({ name, op, segmentName, status, attributes: { ...connection, ...attributes } });

      // A cache span is a db span the cache hook took over: it is renamed to its cache operation
      // and reports the connection it inherited as peer attributes too.
      const cacheSpan = (
        op: 'cache.get' | 'cache.put' | 'cache.remove',
        attributes: Record<string, unknown>,
      ): unknown => span(op, op, { ...peer, 'cache.operation': op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-redis-5.mjs', 'instrument-redis-5.mjs', (createTestRunner, test) => {
        test('creates streamed db and cache spans (redis-5)', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .withEnv({ STREAMED: 'true' })
            .expect({
              span: (container: SerializedStreamedSpanContainer) => {
                expect(container.items.filter(item => item.is_segment).map(item => item.name)).toEqual([
                  'redis-connect',
                  segmentName,
                ]);

                expect(childSpans(container)).toEqual([
                  span('SET localhost:6383', redisSpanOp, {
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET redis-5-test-key [1 other arguments]',
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET redis-5-cache:test-key [1 other arguments]',
                    'cache.key': ['redis-5-cache:test-key'],
                    'cache.item_size': 2,
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET redis-5-cache:test-key-set-EX [3 other arguments]',
                    'cache.key': ['redis-5-cache:test-key-set-EX'],
                    'cache.item_size': 2,
                  }),
                  cacheSpan('cache.put', {
                    'db.operation.name': 'SETEX',
                    'db.query.text': 'SETEX redis-5-cache:test-key-setex [2 other arguments]',
                    'cache.key': ['redis-5-cache:test-key-setex'],
                    'cache.item_size': 2,
                  }),
                  span('GET localhost:6383', redisSpanOp, {
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET redis-5-test-key',
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET redis-5-cache:test-key',
                    'cache.key': ['redis-5-cache:test-key'],
                    'cache.hit': true,
                    'cache.item_size': 10,
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET redis-5-cache:unavailable-data',
                    'cache.key': ['redis-5-cache:unavailable-data'],
                    'cache.hit': false,
                  }),
                  cacheSpan('cache.get', {
                    'db.operation.name': 'MGET',
                    'db.query.text': 'MGET [3 other arguments]',
                    'cache.key': ['redis-5-test-key', 'redis-5-cache:test-key', 'redis-5-cache:unavailable-data'],
                    'cache.hit': true,
                    'cache.item_size': 20,
                  }),
                  cacheSpan('cache.remove', {
                    'db.operation.name': 'DEL',
                    'db.query.text': 'DEL redis-5-cache:test-key',
                    'cache.key': ['redis-5-cache:test-key'],
                  }),
                  span('MULTI', redisSpanOp, { 'db.operation.name': 'MULTI', 'db.operation.batch.size': 2 }),
                  span(
                    'INCR localhost:6383',
                    redisSpanOp,
                    {
                      'db.operation.name': 'INCR',
                      'db.query.text': 'INCR redis-5-test-key',
                      'error.type': 'Error',
                      'sentry.status.message': 'ERR value is not an integer or out of range',
                    },
                    'error',
                  ),
                ]);
              },
            })
            .start()
            .completed();
        });
      });
    });
  });
});
