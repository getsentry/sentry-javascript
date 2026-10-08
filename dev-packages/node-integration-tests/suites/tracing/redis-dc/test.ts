import {
  CACHE_HIT,
  CACHE_ITEM_SIZE,
  CACHE_KEY,
  CACHE_OPERATION,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  ERROR_TYPE,
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
  SENTRY_STATUS_MESSAGE,
  SENTRY_TRACE_LIFECYCLE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, type CACHE_REMOVE, DB_QUERY } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { EXPECTED_SDK_NAME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose(
  'redis v5 diagnostics_channel auto instrumentation',
  { workingDirectory: [__dirname] },
  () => {
    afterAll(() => {
      cleanupChildProcesses();
    });

    createEsmAndCjsTests(__dirname, 'scenario-redis-5-tracing.mjs', 'instrument.mjs', (createTestRunner, test) => {
      // `ignoreSpans` is evaluated at span start under streaming, so this only passes because the
      // span starts as a cache span — a db span renamed at response time would slip through.
      test('drops cache spans matching an ignoreSpans op filter at span start', { timeout: 60_000 }, async () => {
        await createTestRunner()
          .withEnv({ IGNORE_CACHE_GET: 'true' })
          .unignore('client_report')
          // The span container and the client report flush on independent timers, so they can
          // arrive in either order.
          .unordered()
          .expect({
            span: container => {
              const names = container.items.map(item => item.name);
              expect(names).toContain(CACHE_PUT);
              expect(names).not.toContain(CACHE_GET);
            },
          })
          .expect({
            client_report: {
              discarded_events: [
                // the two GETs on cache keys plus the failing GET, which is also decided at start
                { category: 'span', quantity: 3, reason: 'ignored' },
              ],
            },
          })
          .start()
          .completed();
      });
    });

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

      // A cache span is a db span whose key matched a cache prefix: it starts named after its
      // cache operation and reports the connection as peer attributes too.
      const cacheSpan = (
        op: typeof CACHE_GET | typeof CACHE_PUT | typeof CACHE_REMOVE,
        attributes: Record<string, unknown>,
      ): unknown => streamedSpan(op, op, { ...PEER, [CACHE_OPERATION]: op.slice('cache.'.length), ...attributes });

      createEsmAndCjsTests(__dirname, 'scenario-redis-5-tracing.mjs', 'instrument.mjs', (createTestRunner, test) => {
        test('should create spans for redis v5 commands via diagnostics_channel', { timeout: 60_000 }, async () => {
          await createTestRunner()
            .expect({
              span: container => {
                // The connect span opens its own segment but shares the trace with the test span,
                // so both segments arrive in the same container.
                expect(container.items.filter(item => item.is_segment).map(item => item.name)).toEqual([
                  'redis-connect',
                  SEGMENT_NAME,
                ]);

                const spans = container.items.filter(
                  item => !item.is_segment && item.attributes[SENTRY_SEGMENT_NAME]?.value === SEGMENT_NAME,
                );

                expect(spans).toEqual([
                  streamedSpan(`SET ${HOST}:${PORT}`, DB_QUERY, {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET dc-test-key ?',
                  }),
                  // cache SET: starts as a cache span
                  cacheSpan(CACHE_PUT, {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET dc-cache:test-key ?',
                    [CACHE_KEY]: ['dc-cache:test-key'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  // cache SET with EX option: redis v5 sends SET key value EX 10 as the command
                  cacheSpan(CACHE_PUT, {
                    [DB_OPERATION_NAME]: 'SET',
                    [DB_QUERY_TEXT]: 'SET dc-cache:test-key-ex ? ? ?',
                    [CACHE_KEY]: ['dc-cache:test-key-ex'],
                    [CACHE_ITEM_SIZE]: 2,
                  }),
                  streamedSpan(`GET ${HOST}:${PORT}`, DB_QUERY, {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET dc-test-key',
                  }),
                  // cache GET (hit)
                  cacheSpan(CACHE_GET, {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET dc-cache:test-key',
                    [CACHE_KEY]: ['dc-cache:test-key'],
                    [CACHE_HIT]: true,
                    [CACHE_ITEM_SIZE]: 10,
                  }),
                  // cache GET (miss)
                  cacheSpan(CACHE_GET, {
                    [DB_OPERATION_NAME]: 'GET',
                    [DB_QUERY_TEXT]: 'GET dc-cache:unavailable-data',
                    [CACHE_KEY]: ['dc-cache:unavailable-data'],
                    [CACHE_HIT]: false,
                  }),
                  // MGET: node-redis sanitizes args for diagnostics_channel (keys become '?'),
                  // so cache detection cannot match prefixes — remains a plain db.query span.
                  streamedSpan(`MGET ${HOST}:${PORT}`, DB_QUERY, {
                    [DB_OPERATION_NAME]: 'MGET',
                    [DB_QUERY_TEXT]: 'MGET ? ? ?',
                  }),
                  streamedSpan(`LPUSH ${HOST}:${PORT}`, DB_QUERY, {
                    [DB_OPERATION_NAME]: 'LPUSH',
                    [DB_QUERY_TEXT]: 'LPUSH dc-cache:list-key ?',
                  }),
                  // a failing command on a cache key reports as an errored cache span:
                  // the span starts as a cache span, so the classification survives the error
                  {
                    ...(cacheSpan(CACHE_GET, {
                      [DB_OPERATION_NAME]: 'GET',
                      [DB_QUERY_TEXT]: 'GET dc-cache:list-key',
                      [CACHE_KEY]: ['dc-cache:list-key'],
                      [ERROR_TYPE]: 'Error',
                      [SENTRY_STATUS_MESSAGE]: 'WRONGTYPE Operation against a key holding the wrong kind of value',
                    }) as Record<string, unknown>),
                    status: 'error',
                  },
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
