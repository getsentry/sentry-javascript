import {
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  ERROR_TYPE,
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
import { DB_QUERY } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { EXPECTED_SDK_NAME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('redis auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Under orchestrion, ioredis <5.11 is instrumented by the diagnostics-channel
  // subscriber instead of the OTel monkey-patch, so the span origin differs. All
  // other attributes are identical.
  const origin = 'auto.db.redis';
  const redisSpanOp = DB_QUERY;
  describe('streamed', () => {
    const COMMON_ATTRIBUTES = {
      [SENTRY_IS_LOCALHOST]: { type: 'boolean', value: false },
      [DB_SYSTEM_NAME]: { type: 'string', value: 'redis' },
      [SERVER_ADDRESS]: { type: 'string', value: 'localhost' },
      [SERVER_PORT]: { type: 'integer', value: 6380 },
      [SENTRY_KIND]: { type: 'string', value: 'client' },
      [SENTRY_ENVIRONMENT]: { type: 'string', value: 'production' },
      [SENTRY_OP]: { type: 'string', value: redisSpanOp },
      [SENTRY_ORIGIN]: { type: 'string', value: origin },
      [SENTRY_RELEASE]: { type: 'string', value: '1.0' },
      [SENTRY_SDK_NAME]: { type: 'string', value: EXPECTED_SDK_NAME },
      [SENTRY_SDK_VERSION]: { type: 'string', value: expect.any(String) },
      [SENTRY_SEGMENT_ID]: { type: 'string', value: expect.stringMatching(/^[\da-f]{16}$/) },
      [SENTRY_SEGMENT_NAME]: { type: 'string', value: 'Test Span' },
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
          [DB_OPERATION_NAME]: { type: 'string', value: operation },
          [DB_QUERY_TEXT]: { type: 'string', value: statement },
          ...(errorMessage
            ? {
                [ERROR_TYPE]: { type: 'string', value: 'ReplyError' },
                [SENTRY_STATUS_MESSAGE]: { type: 'string', value: errorMessage },
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
      test(
        'should auto-instrument `ioredis` package when using redis.set() and redis.get()',
        { timeout: 75_000 },
        async () => {
          await createTestRunner()
            .expect({
              span: container => {
                const segmentSpan = container.items.find(item => item.is_segment);
                expect(segmentSpan?.name).toBe('Test Span');

                const dbSpans = container.items.filter(item => item.attributes[SENTRY_OP]?.value === redisSpanOp);

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
        },
      );
    });
  });
});
