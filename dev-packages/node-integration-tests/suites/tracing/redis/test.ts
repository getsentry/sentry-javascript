import { SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, type SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('redis auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Under orchestrion, ioredis <5.11 is instrumented by the diagnostics-channel
  // subscriber instead of the OTel monkey-patch, so the span origin differs. All
  // other attributes are identical.
  const origin = 'auto.db.redis';
  const redisSpanOp = 'db.query';
  const redisData = {
    'db.system.name': 'redis',
    'server.address': 'localhost',
    'server.port': 6380,
  };

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Span',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'set test-key [1 other arguments]',
        op: redisSpanOp,
        origin,
        data: expect.objectContaining({
          'sentry.op': redisSpanOp,
          'sentry.origin': origin,
          ...redisData,
          'db.query.text': 'set test-key [1 other arguments]',
        }),
      }),
      expect.objectContaining({
        description: 'get test-key',
        op: redisSpanOp,
        origin,
        data: expect.objectContaining({
          'sentry.op': redisSpanOp,
          'sentry.origin': origin,
          ...redisData,
          'db.query.text': 'get test-key',
        }),
      }),
      // a failing command produces a span with an error status
      expect.objectContaining({
        description: 'incr test-key',
        op: redisSpanOp,
        status: 'internal_error',
        origin,
        data: expect.objectContaining({
          'sentry.op': redisSpanOp,
          'sentry.origin': origin,
          ...redisData,
          'db.query.text': 'incr test-key',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test(
      'should auto-instrument `ioredis` package when using redis.set() and redis.get()',
      { timeout: 75_000 },
      async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      },
    );
  });

  describe('streamed', () => {
    // The same three commands as above, asserted on the streamed span container. Only the span
    // name differs: with span streaming names have to be low cardinality, so the serialized
    // statement is reported through `db.query.text` alone and the name becomes
    // `{db.operation.name} {server.address}:{server.port}`.
    const COMMON_ATTRIBUTES = {
      'db.system.name': { type: 'string', value: 'redis' },
      'server.address': { type: 'string', value: 'localhost' },
      'server.port': { type: 'integer', value: 6380 },
      'sentry.kind': { type: 'string', value: 'client' },
      'sentry.environment': { type: 'string', value: 'production' },
      'sentry.op': { type: 'string', value: redisSpanOp },
      'sentry.origin': { type: 'string', value: origin },
      'sentry.release': { type: 'string', value: '1.0' },
      'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.node' },
      'sentry.sdk.version': { type: 'string', value: expect.any(String) },
      'sentry.segment.id': { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
      'sentry.segment.name': { type: 'string', value: 'Test Span' },
      [SENTRY_TRACE_LIFECYCLE]: { type: 'string', value: 'stream' },
    };

    function expectedDbSpan({
      operation,
      statement,
      status = 'ok',
      errorMessage,
    }: {
      operation: string;
      statement: string;
      status?: string;
      errorMessage?: string;
    }): unknown {
      return {
        attributes: {
          ...COMMON_ATTRIBUTES,
          'db.operation.name': { type: 'string', value: operation },
          'db.query.text': { type: 'string', value: statement },
          ...(errorMessage
            ? {
                'error.type': { type: 'string', value: 'ReplyError' },
                'sentry.status.message': { type: 'string', value: errorMessage },
              }
            : {}),
        },
        name: `${operation} localhost:6380`,
        end_timestamp: expect.any(Number),
        is_segment: false,
        parent_span_id: expect.stringMatching(/^[\da-f]{16}$/),
        span_id: expect.stringMatching(/^[\da-f]{16}$/),
        start_timestamp: expect.any(Number),
        status,
        trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      };
    }

    createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('should auto-instrument `ioredis` package with span streaming enabled', { timeout: 75_000 }, async () => {
        await createTestRunner()
          .withEnv({ STREAMED: 'true' })
          .expect({
            span: (container: SerializedStreamedSpanContainer) => {
              const segmentSpan = container.items.find(item => item.is_segment);
              expect(segmentSpan?.name).toBe('Test Span');

              const dbSpans = container.items.filter(
                item => item.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === redisSpanOp,
              );

              expect(dbSpans).toEqual([
                expectedDbSpan({ operation: 'set', statement: 'set test-key [1 other arguments]' }),
                expectedDbSpan({ operation: 'get', statement: 'get test-key' }),
                // a failing command produces a span with an error status
                expectedDbSpan({
                  operation: 'incr',
                  statement: 'incr test-key',
                  status: 'error',
                  errorMessage: 'ERR value is not an integer or out of range',
                }),
              ]);
            },
          })
          .start()
          .completed();
      });
    });
  });
});
