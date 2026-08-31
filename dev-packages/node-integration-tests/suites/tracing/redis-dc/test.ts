import { SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
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
    });

    // The same commands as above, asserted on the streamed span container. With span streaming the
    // db spans are named `{db.operation.name} {server.address}:{server.port}` instead of
    // `redis-{command}`.
    describe('streamed', () => {
      const ORIGIN = 'auto.db.redis.diagnostic_channel';
      const SEGMENT_NAME = 'Test Span Redis 5 DC';
      const HOST = '127.0.0.1';
      const PORT = 6381;

      const streamAttribute = (value: unknown): { type: string; value: unknown } => ({
        type: Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value,
        value,
      });

      // Streamed spans carry `{ type, value }` attribute pairs; the expectations below are written
      // as plain values and wrapped here.
      const streamAttributes = (values: Record<string, unknown>): Record<string, unknown> =>
        Object.fromEntries(Object.entries(values).map(([key, value]) => [key, streamAttribute(value)]));

      function streamedSpan(name: string, op: string, attributes: Record<string, unknown>): unknown {
        return {
          name,
          attributes: {
            ...streamAttributes({
              'db.system.name': 'redis',
              'sentry.environment': 'production',
              'sentry.op': op,
              'sentry.origin': ORIGIN,
              'sentry.release': '1.0',
              'sentry.sdk.name': 'sentry.javascript.node',
              'sentry.segment.name': SEGMENT_NAME,
              'server.address': HOST,
              'server.port': PORT,
              [SENTRY_TRACE_LIFECYCLE]: 'stream',
              ...attributes,
            }),
            'sentry.sdk.version': { type: 'string', value: expect.any(String) },
            'sentry.segment.id': { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
          },
          end_timestamp: expect.any(Number),
          is_segment: false,
          parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
          span_id: expect.stringMatching(/^[\da-f]{16}$/),
          start_timestamp: expect.any(Number),
          status: 'ok',
          trace_id: expect.stringMatching(/^[\da-f]{32}$/),
        };
      }

      const PEER = { 'network.peer.address': HOST, 'network.peer.port': PORT };

      createEsmAndCjsTests(__dirname, 'scenario-redis-5-tracing.mjs', 'instrument.mjs', (createTestRunner, test) => {
        test('creates streamed spans for redis v5 commands via diagnostics_channel', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .withEnv({ STREAMED: 'true' })
            .expect({
              span: (container: SerializedStreamedSpanContainer) => {
                // The connect span opens its own segment but shares the trace with the test span,
                // so both segments arrive in the same container.
                expect(container.items.filter(item => item.is_segment).map(item => item.name)).toEqual([
                  'redis-connect',
                  SEGMENT_NAME,
                ]);

                const spans = container.items.filter(
                  item => !item.is_segment && item.attributes['sentry.segment.name']?.value === SEGMENT_NAME,
                );

                expect(spans).toEqual([
                  streamedSpan(`SET ${HOST}:${PORT}`, 'db.query', {
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET dc-test-key ?',
                  }),
                  // cache SET: span name updated to the key by the cache hook
                  streamedSpan('dc-cache:test-key', 'cache.put', {
                    ...PEER,
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET dc-cache:test-key ?',
                    'cache.key': ['dc-cache:test-key'],
                    'cache.item_size': 2,
                  }),
                  // cache SET with EX option: redis v5 sends SET key value EX 10 as the command
                  streamedSpan('dc-cache:test-key-ex', 'cache.put', {
                    ...PEER,
                    'db.operation.name': 'SET',
                    'db.query.text': 'SET dc-cache:test-key-ex ? ? ?',
                    'cache.key': ['dc-cache:test-key-ex'],
                    'cache.item_size': 2,
                  }),
                  streamedSpan(`GET ${HOST}:${PORT}`, 'db.query', {
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET dc-test-key',
                  }),
                  // cache GET (hit)
                  streamedSpan('dc-cache:test-key', 'cache.get', {
                    ...PEER,
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET dc-cache:test-key',
                    'cache.key': ['dc-cache:test-key'],
                    'cache.hit': true,
                    'cache.item_size': 10,
                  }),
                  // cache GET (miss)
                  streamedSpan('dc-cache:unavailable-data', 'cache.get', {
                    ...PEER,
                    'db.operation.name': 'GET',
                    'db.query.text': 'GET dc-cache:unavailable-data',
                    'cache.key': ['dc-cache:unavailable-data'],
                    'cache.hit': false,
                  }),
                  // MGET: node-redis sanitizes args for diagnostics_channel (keys become '?'),
                  // so cache detection cannot match prefixes — remains a plain db.query span.
                  streamedSpan(`MGET ${HOST}:${PORT}`, 'db.query', {
                    'db.operation.name': 'MGET',
                    'db.query.text': 'MGET ? ? ?',
                  }),
                ]);
              },
            })
            .start()
            .completed();
        });
      });
    });
  },
);
