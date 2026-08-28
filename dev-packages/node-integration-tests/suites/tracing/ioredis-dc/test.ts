import { SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose(
  'ioredis v5.11 diagnostics_channel auto instrumentation',
  { workingDirectory: [__dirname] },
  () => {
    afterAll(() => {
      cleanupChildProcesses();
    });

    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span IORedis 5.11 DC',
      spans: expect.arrayContaining([
        expect.objectContaining({
          op: 'db.query',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.op': 'db.query',
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.system.name': 'redis',
            'db.query.text': 'set dc-test-key ?',
          }),
        }),
        expect.objectContaining({
          description: 'dc-cache:test-key',
          op: 'cache.put',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'set dc-cache:test-key ?',
            'cache.key': ['dc-cache:test-key'],
            'cache.item_size': 2,
          }),
        }),
        expect.objectContaining({
          description: 'dc-cache:test-key-ex',
          op: 'cache.put',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'set dc-cache:test-key-ex ? ? ?',
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
            'db.query.text': 'get dc-test-key',
          }),
        }),
        expect.objectContaining({
          description: 'dc-cache:test-key',
          op: 'cache.get',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'get dc-cache:test-key',
            'cache.hit': true,
            'cache.key': ['dc-cache:test-key'],
            'cache.item_size': 10,
          }),
        }),
        expect.objectContaining({
          description: 'dc-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.query.text': 'get dc-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['dc-cache:unavailable-data'],
          }),
        }),
        expect.objectContaining({
          op: 'db.query',
          origin: 'auto.db.redis.diagnostic_channel',
          data: expect.objectContaining({
            'sentry.op': 'db.query',
            'sentry.origin': 'auto.db.redis.diagnostic_channel',
            'db.system.name': 'redis',
            'db.query.text': 'mget ? ? ?',
          }),
        }),
      ]),
    };

    const EXPECTED_CONNECT = {
      transaction: 'redis-connect',
    };

    createEsmAndCjsTests(__dirname, 'scenario-ioredis-5-11.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('creates spans for ioredis v5.11 commands via diagnostics_channel', { timeout: 75_000 }, async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_CONNECT })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });

    // The same commands as above, asserted on the streamed span container. The native
    // diagnostics_channel subscriber already names db spans `redis-{command}`, which is low
    // cardinality, so span streaming does not change them.
    describe('streamed', () => {
      const ORIGIN = 'auto.db.redis.diagnostic_channel';
      const SEGMENT_NAME = 'Test Span IORedis 5.11 DC';
      const HOST = '127.0.0.1';
      const PORT = 6382;

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

      createEsmAndCjsTests(__dirname, 'scenario-ioredis-5-11.mjs', 'instrument.mjs', (createTestRunner, test) => {
        test(
          'creates streamed spans for ioredis v5.11 commands via diagnostics_channel',
          { timeout: 75_000 },
          async () => {
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

                  // ioredis' own handshake commands (`client SETINFO`, `info`) are emitted on the
                  // channel too, but belong to the connect segment — the test span's children are the
                  // commands the scenario issues.
                  const spans = container.items.filter(
                    item => !item.is_segment && item.attributes['sentry.segment.name']?.value === SEGMENT_NAME,
                  );

                  expect(spans).toEqual([
                    streamedSpan('redis-set', 'db.query', {
                      'db.operation.name': 'set',
                      'db.query.text': 'set dc-test-key ?',
                    }),
                    streamedSpan('dc-cache:test-key', 'cache.put', {
                      ...PEER,
                      'db.operation.name': 'set',
                      'db.query.text': 'set dc-cache:test-key ?',
                      'cache.key': ['dc-cache:test-key'],
                      'cache.item_size': 2,
                    }),
                    streamedSpan('dc-cache:test-key-ex', 'cache.put', {
                      ...PEER,
                      'db.operation.name': 'set',
                      'db.query.text': 'set dc-cache:test-key-ex ? ? ?',
                      'cache.key': ['dc-cache:test-key-ex'],
                      'cache.item_size': 2,
                    }),
                    streamedSpan('redis-get', 'db.query', {
                      'db.operation.name': 'get',
                      'db.query.text': 'get dc-test-key',
                    }),
                    streamedSpan('dc-cache:test-key', 'cache.get', {
                      ...PEER,
                      'db.operation.name': 'get',
                      'db.query.text': 'get dc-cache:test-key',
                      'cache.key': ['dc-cache:test-key'],
                      'cache.hit': true,
                      'cache.item_size': 10,
                    }),
                    streamedSpan('dc-cache:unavailable-data', 'cache.get', {
                      ...PEER,
                      'db.operation.name': 'get',
                      'db.query.text': 'get dc-cache:unavailable-data',
                      'cache.key': ['dc-cache:unavailable-data'],
                      'cache.hit': false,
                    }),
                    streamedSpan('redis-mget', 'db.query', {
                      'db.operation.name': 'mget',
                      'db.query.text': 'mget ? ? ?',
                    }),
                  ]);
                },
              })
              .start()
              .completed();
          },
        );
      });
    });
  },
);
