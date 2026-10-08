import {
  CACHE_HIT,
  CACHE_ITEM_SIZE,
  CACHE_KEY,
  CACHE_OPERATION,
  DB_OPERATION_BATCH_SIZE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  ERROR_TYPE,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  SENTRY_ENVIRONMENT,
  SENTRY_IS_LOCALHOST,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_RELEASE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_STATUS_MESSAGE,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { EXPECTED_SDK_NAME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('redis cache auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const redisOrigin = 'auto.db.redis';
  const redisSpanOp = 'db.query';

  describe('streamed', () => {
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
        [DB_SYSTEM_NAME]: 'redis',
        [SENTRY_ENVIRONMENT]: 'production',
        [SENTRY_KIND]: 'client',
        [SENTRY_ORIGIN]: redisOrigin,
        [SENTRY_RELEASE]: '1.0',
        [SENTRY_SDK_NAME]: EXPECTED_SDK_NAME,
        [SENTRY_SEGMENT_NAME]: segmentName,
        [SENTRY_TRACE_LIFECYCLE]: 'stream',
      }),
      [SENTRY_SDK_VERSION]: { type: 'string', value: expect.any(String) },
      [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: false },
      [SENTRY_SEGMENT_ID]: { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
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
          ...streamAttributes({ [SENTRY_OP]: op, ...attributes }),
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
      const connection = { [SERVER_ADDRESS]: 'localhost', [SERVER_PORT]: 6383 };
      const peer = { [NETWORK_PEER_ADDRESS]: 'localhost', [NETWORK_PEER_PORT]: 6383 };

      const span = (name: string, op: string, attributes: Record<string, unknown>, status?: string): unknown =>
        streamedSpan({ name, op, segmentName, status, attributes: { ...connection, ...attributes } });

      // A cache span is a db span the cache hook took over: it is renamed to its cache operation
      // and reports the connection it inherited as peer attributes too.
      const cacheSpan = (
        op: 'cache.get' | 'cache.put' | 'cache.remove',
        attributes: Record<string, unknown>,
      ): unknown => span(op, op, { ...peer, [CACHE_OPERATION]: op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument-ioredis.mjs', (createTestRunner, test) => {
        test('should create cache spans for prefixed keys (ioredis)', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .expect({
              span: container => {
                expect(container.items.find(item => item.is_segment)?.name).toBe(segmentName);

                expect(childSpans(container)).toEqual([
                  span('set localhost:6383', redisSpanOp, {
                    [DB_OPERATION_NAME]: 'set',
                    [DB_QUERY_TEXT]: 'set test-key [1 other arguments]',
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'set',
                    [DB_QUERY_TEXT]: 'set ioredis-cache:test-key [1 other arguments]',
                    [CACHE_KEY]: ['ioredis-cache:test-key'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'set',
                    [DB_QUERY_TEXT]: 'set ioredis-cache:test-key-set-EX [3 other arguments]',
                    [CACHE_KEY]: ['ioredis-cache:test-key-set-EX'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'setex',
                    [DB_QUERY_TEXT]: 'setex ioredis-cache:test-key-setex [2 other arguments]',
                    [CACHE_KEY]: ['ioredis-cache:test-key-setex'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  span('get localhost:6383', redisSpanOp, {
                    [DB_OPERATION_NAME]: 'get',
                    [DB_QUERY_TEXT]: 'get test-key',
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'get',
                    [DB_QUERY_TEXT]: 'get ioredis-cache:test-key',
                    [CACHE_KEY]: ['ioredis-cache:test-key'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 10,
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'get',
                    [DB_QUERY_TEXT]: 'get ioredis-cache:unavailable-data',
                    [CACHE_KEY]: ['ioredis-cache:unavailable-data'],
                    [CACHE_HIT]: false,
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'mget',
                    [DB_QUERY_TEXT]: 'mget [3 other arguments]',
                    [CACHE_KEY]: ['test-key', 'ioredis-cache:test-key', 'ioredis-cache:unavailable-data'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 20,
                  }),
                  cacheSpan('cache.remove', {
                    [DB_OPERATION_NAME]: 'del',
                    [DB_QUERY_TEXT]: 'del ioredis-cache:test-key',
                    [CACHE_KEY]: ['ioredis-cache:test-key'],
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
      const connection = { [SERVER_ADDRESS]: 'localhost', [SERVER_PORT]: 6383 };
      const peer = { [NETWORK_PEER_ADDRESS]: 'localhost', [NETWORK_PEER_PORT]: 6383 };

      const span = (name: string, op: string, attributes: Record<string, unknown>, status?: string): unknown =>
        streamedSpan({ name, op, segmentName, status, attributes: { ...connection, ...attributes } });

      // A cache span is a db span the cache hook took over: it is renamed to its cache operation
      // and reports the connection it inherited as peer attributes too.
      const cacheSpan = (
        op: 'cache.get' | 'cache.put' | 'cache.remove',
        attributes: Record<string, unknown>,
      ): unknown => span(op, op, { ...peer, [CACHE_OPERATION]: op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-redis-4.mjs', 'instrument-redis-4.mjs', (createTestRunner, test) => {
        test('should create cache spans for prefixed keys (redis-4)', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .expect({
              span: container => {
                // The connect span opens its own segment, but shares the trace with the test span,
                // so both segments arrive in the same container.
                expect(container.items.filter(item => item.is_segment).map(item => item.name)).toEqual([
                  'redis-connect',
                  segmentName,
                ]);

                expect(childSpans(container)).toEqual([
                  span('SET localhost:6383', redisSpanOp, {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET redis-test-key [1 other arguments]',
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET redis-cache:test-key [1 other arguments]',
                    [CACHE_KEY]: ['redis-cache:test-key'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET redis-cache:test-key-set-EX [3 other arguments]',
                    [CACHE_KEY]: ['redis-cache:test-key-set-EX'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'SETEX',
                    [DB_QUERY_TEXT]: 'SETEX redis-cache:test-key-setex [2 other arguments]',
                    [CACHE_KEY]: ['redis-cache:test-key-setex'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  span('GET localhost:6383', redisSpanOp, {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET redis-test-key',
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET redis-cache:test-key',
                    [CACHE_KEY]: ['redis-cache:test-key'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 10,
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET redis-cache:unavailable-data',
                    [CACHE_KEY]: ['redis-cache:unavailable-data'],
                    [CACHE_HIT]: false,
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'MGET',
                    [DB_QUERY_TEXT]: 'MGET [3 other arguments]',
                    [CACHE_KEY]: ['redis-test-key', 'redis-cache:test-key', 'redis-cache:unavailable-data'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 20,
                  }),
                  cacheSpan('cache.remove', {
                    [DB_OPERATION_NAME]: 'DEL',
                    [DB_QUERY_TEXT]: 'DEL redis-cache:test-key',
                    [CACHE_KEY]: ['redis-cache:test-key'],
                  }),
                  // Batch spans are named after the batch operation, which is already low cardinality.
                  span('MULTI', redisSpanOp, { [DB_OPERATION_NAME]: 'MULTI', [DB_OPERATION_BATCH_SIZE]: 2 }),
                  span(
                    'INCR localhost:6383',
                    redisSpanOp,
                    {
                      [DB_OPERATION_NAME]: 'INCR',
                      [DB_QUERY_TEXT]: 'INCR redis-test-key',
                      [ERROR_TYPE]: 'Error',
                      [SENTRY_STATUS_MESSAGE]: 'ERR value is not an integer or out of range',
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
      const connection = { [SERVER_ADDRESS]: 'localhost', [SERVER_PORT]: 6383 };
      const peer = { [NETWORK_PEER_ADDRESS]: 'localhost', [NETWORK_PEER_PORT]: 6383 };

      const span = (name: string, op: string, attributes: Record<string, unknown>, status?: string): unknown =>
        streamedSpan({ name, op, segmentName, status, attributes: { ...connection, ...attributes } });

      // A cache span is a db span the cache hook took over: it is renamed to its cache operation
      // and reports the connection it inherited as peer attributes too.
      const cacheSpan = (
        op: 'cache.get' | 'cache.put' | 'cache.remove',
        attributes: Record<string, unknown>,
      ): unknown => span(op, op, { ...peer, [CACHE_OPERATION]: op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-redis-5.mjs', 'instrument-redis-5.mjs', (createTestRunner, test) => {
        test('should create cache spans for prefixed keys (redis-5)', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .expect({
              span: container => {
                expect(container.items.filter(item => item.is_segment).map(item => item.name)).toEqual([
                  'redis-connect',
                  segmentName,
                ]);

                expect(childSpans(container)).toEqual([
                  span('SET localhost:6383', redisSpanOp, {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET redis-5-test-key [1 other arguments]',
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET redis-5-cache:test-key [1 other arguments]',
                    [CACHE_KEY]: ['redis-5-cache:test-key'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET redis-5-cache:test-key-set-EX [3 other arguments]',
                    [CACHE_KEY]: ['redis-5-cache:test-key-set-EX'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'SETEX',
                    [DB_QUERY_TEXT]: 'SETEX redis-5-cache:test-key-setex [2 other arguments]',
                    [CACHE_KEY]: ['redis-5-cache:test-key-setex'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  span('GET localhost:6383', redisSpanOp, {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET redis-5-test-key',
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET redis-5-cache:test-key',
                    [CACHE_KEY]: ['redis-5-cache:test-key'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 10,
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET redis-5-cache:unavailable-data',
                    [CACHE_KEY]: ['redis-5-cache:unavailable-data'],
                    [CACHE_HIT]: false,
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'MGET',
                    [DB_QUERY_TEXT]: 'MGET [3 other arguments]',
                    [CACHE_KEY]: ['redis-5-test-key', 'redis-5-cache:test-key', 'redis-5-cache:unavailable-data'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 20,
                  }),
                  cacheSpan('cache.remove', {
                    [DB_OPERATION_NAME]: 'DEL',
                    [DB_QUERY_TEXT]: 'DEL redis-5-cache:test-key',
                    [CACHE_KEY]: ['redis-5-cache:test-key'],
                  }),
                  span('MULTI', redisSpanOp, { [DB_OPERATION_NAME]: 'MULTI', [DB_OPERATION_BATCH_SIZE]: 2 }),
                  span(
                    'INCR localhost:6383',
                    redisSpanOp,
                    {
                      [DB_OPERATION_NAME]: 'INCR',
                      [DB_QUERY_TEXT]: 'INCR redis-5-test-key',
                      [ERROR_TYPE]: 'Error',
                      [SENTRY_STATUS_MESSAGE]: 'ERR value is not an integer or out of range',
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
