import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose(
  'redis v5 diagnostics_channel auto instrumentation',
  { workingDirectory: [__dirname] },
  () => {
    afterAll(() => {
      cleanupChildProcesses();
    });

    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span Redis 5 DC',
      spans: expect.arrayContaining([
        expect.objectContaining({
          op: 'db.query',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.op': 'db.query',
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.system.name': 'redis',
            'db.query.text': 'SET dc-test-key ?',
          }),
        }),
        // cache SET: span name updated to key by cacheResponseHook
        expect.objectContaining({
          description: 'dc-cache:test-key',
          op: 'cache.put',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'SET dc-cache:test-key ?',
            'cache.key': ['dc-cache:test-key'],
            'cache.item_size': 2,
          }),
        }),
        // cache SET with EX option: redis v5 sends SET key value EX 10 as the command
        expect.objectContaining({
          description: 'dc-cache:test-key-ex',
          op: 'cache.put',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'SET dc-cache:test-key-ex ? ? ?',
            'cache.key': ['dc-cache:test-key-ex'],
            'cache.item_size': 2,
          }),
        }),
        expect.objectContaining({
          op: 'db.query',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.op': 'db.query',
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.system.name': 'redis',
            'db.query.text': 'GET dc-test-key',
          }),
        }),
        // cache GET (hit)
        expect.objectContaining({
          description: 'dc-cache:test-key',
          op: 'cache.get',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'GET dc-cache:test-key',
            'cache.hit': true,
            'cache.key': ['dc-cache:test-key'],
            'cache.item_size': 10,
          }),
        }),
        // cache GET (miss)
        expect.objectContaining({
          description: 'dc-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'GET dc-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['dc-cache:unavailable-data'],
          }),
        }),
        // MGET: node-redis sanitizes args for diagnostics_channel (keys become '?'),
        // so cache detection cannot match prefixes — remains a plain db.query span.
        expect.objectContaining({
          op: 'db.query',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.op': 'db.query',
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.system.name': 'redis',
            'db.query.text': 'MGET ? ? ?',
          }),
        }),
        // a failing command on a cache key reports as an errored cache span:
        // the span starts as a cache span, so the classification survives the error
        expect.objectContaining({
          description: 'dc-cache:list-key',
          op: 'cache.get',
          status: 'internal_error',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'cache.operation': 'get',
            'cache.key': ['dc-cache:list-key'],
          }),
        }),
      ]),
    };

    // node-redis emits a node-redis:connect DC event for the initial connection.
    // That fires before startSpan so it arrives as the first envelope.
    const EXPECTED_CONNECT = {
      transaction: 'redis-connect',
    };

    createEsmAndCjsTests(__dirname, 'scenario-redis-5-tracing.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should create spans for redis v5 commands via diagnostics_channel', { timeout: 60_000 }, async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_CONNECT })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });

      test('names cache spans after the cache op with span streaming enabled', { timeout: 60_000 }, async () => {
        // With span streaming, cache spans are named after the low-cardinality op
        // (`cache.{{cache.operation}}`) instead of the cache key.
        const expectedStreamedCacheSpan = (op: string, keys: string[]) =>
          expect.objectContaining({
            name: op,
            is_segment: false,
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: op },
              'sentry.origin': { type: 'string', value: 'auto.db.redis.diagnostic_channel' },
              'cache.key': { type: 'array', value: keys },
            }),
          });

        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          // The connect span may be streamed in its own envelope, ahead of the command spans.
          .unordered()
          .expect({
            span: {
              items: expect.arrayContaining([
                expectedStreamedCacheSpan('cache.put', ['dc-cache:test-key']),
                expectedStreamedCacheSpan('cache.get', ['dc-cache:test-key']),
                expectedStreamedCacheSpan('cache.get', ['dc-cache:unavailable-data']),
                // non-cache spans keep their db.query statement name
                expect.objectContaining({ name: 'redis-GET' }),
              ]),
            },
          })
          .start()
          .completed();
      });

      // `ignoreSpans` is evaluated at span start under streaming, so this only passes because the
      // span starts as a cache span — a db span renamed at response time would slip through.
      test('drops cache spans matching an ignoreSpans op filter at span start', { timeout: 60_000 }, async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true', IGNORE_CACHE_GET: 'true' })
          .unordered()
          .expect({
            span: (container: SerializedStreamedSpanContainer) => {
              const names = container.items.map(item => item.name);
              expect(names).toContain('cache.put');
              expect(names).not.toContain('cache.get');
            },
          })
          .start()
          .completed();
      });
    });
  },
);
