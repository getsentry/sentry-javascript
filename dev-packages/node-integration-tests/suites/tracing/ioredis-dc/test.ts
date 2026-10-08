import {
  CACHE_HIT,
  CACHE_ITEM_SIZE,
  CACHE_KEY,
  CACHE_OPERATION,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  SENTRY_ENVIRONMENT,
  SENTRY_IS_LOCALHOST,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_RELEASE,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { EXPECTED_SDK_NAME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose(
  'ioredis v5.11 diagnostics_channel auto instrumentation',
  { workingDirectory: [__dirname] },
  () => {
    afterAll(() => {
      cleanupChildProcesses();
    });

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
              [DB_SYSTEM_NAME]: 'redis',
              [SENTRY_ENVIRONMENT]: 'production',
              [SENTRY_OP]: op,
              [SENTRY_ORIGIN]: ORIGIN,
              [SENTRY_RELEASE]: '1.0',
              [SENTRY_SDK_NAME]: EXPECTED_SDK_NAME,
              [SENTRY_SEGMENT_NAME]: SEGMENT_NAME,
              [SERVER_ADDRESS]: HOST,
              [SERVER_PORT]: PORT,
              [SENTRY_TRACE_LIFECYCLE]: 'stream',
              ...attributes,
            }),
            [SENTRY_SDK_VERSION]: { type: 'string', value: expect.any(String) },
            [SENTRY_SEGMENT_ID]: { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
            [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: false },
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

      const PEER = { [NETWORK_PEER_ADDRESS]: HOST, [NETWORK_PEER_PORT]: PORT };

      // A cache span is a db span the cache hook took over: it is renamed to its cache operation
      // and reports the connection it inherited as peer attributes too.
      const cacheSpan = (
        op: 'cache.get' | 'cache.put' | 'cache.remove',
        attributes: Record<string, unknown>,
      ): unknown => streamedSpan(op, op, { ...PEER, [CACHE_OPERATION]: op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-ioredis-5-11.mjs', 'instrument.mjs', (createTestRunner, test) => {
        test('creates spans for ioredis v5.11 commands via diagnostics_channel', { timeout: 75_000 }, async () => {
          await createTestRunner()
            .expect({
              span: container => {
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
                  item => !item.is_segment && item.attributes[SENTRY_SEGMENT_NAME]?.value === SEGMENT_NAME,
                );

                expect(spans).toEqual([
                  streamedSpan(`set ${HOST}:${PORT}`, 'db.query', {
                    [DB_OPERATION_NAME]: 'set',
                    [DB_QUERY_TEXT]: 'set dc-test-key ?',
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'set',
                    [DB_QUERY_TEXT]: 'set dc-cache:test-key ?',
                    [CACHE_KEY]: ['dc-cache:test-key'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  cacheSpan('cache.put', {
                    [DB_OPERATION_NAME]: 'set',
                    [DB_QUERY_TEXT]: 'set dc-cache:test-key-ex ? ? ?',
                    [CACHE_KEY]: ['dc-cache:test-key-ex'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  streamedSpan(`get ${HOST}:${PORT}`, 'db.query', {
                    [DB_OPERATION_NAME]: 'get',
                    [DB_QUERY_TEXT]: 'get dc-test-key',
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'get',
                    [DB_QUERY_TEXT]: 'get dc-cache:test-key',
                    [CACHE_KEY]: ['dc-cache:test-key'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 10,
                  }),
                  cacheSpan('cache.get', {
                    [DB_OPERATION_NAME]: 'get',
                    [DB_QUERY_TEXT]: 'get dc-cache:unavailable-data',
                    [CACHE_KEY]: ['dc-cache:unavailable-data'],
                    [CACHE_HIT]: false,
                  }),
                  streamedSpan(`mget ${HOST}:${PORT}`, 'db.query', {
                    [DB_OPERATION_NAME]: 'mget',
                    [DB_QUERY_TEXT]: 'mget ? ? ?',
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
