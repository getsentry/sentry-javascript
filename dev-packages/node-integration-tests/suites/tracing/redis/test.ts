import { afterAll, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('redis auto instrumentation', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Under orchestrion, ioredis <5.11 is instrumented by the diagnostics-channel
  // subscriber instead of the OTel monkey-patch, so the span origin differs. All
  // other attributes are identical.
  const origin = isOrchestrionEnabled() ? 'auto.db.redis' : 'auto.db.otel.redis';
  const redisSpanOp = isOrchestrionEnabled() ? 'db.query' : 'db';
  const redisData = isOrchestrionEnabled()
    ? {
        'db.system.name': 'redis',
        'server.address': 'localhost',
        'server.port': 6380,
      }
    : {
        'db.system': 'redis',
        'net.peer.name': 'localhost',
        'net.peer.port': 6380,
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
});
