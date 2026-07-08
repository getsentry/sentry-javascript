import { afterAll, describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('redis auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Under orchestrion, ioredis <5.11 is instrumented by the diagnostics-channel
  // subscriber instead of the OTel monkey-patch, so the span origin differs. All
  // other attributes are identical.
  const origin = isOrchestrionEnabled() ? 'auto.db.orchestrion.redis' : 'auto.db.otel.redis';

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Span',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'set test-key [1 other arguments]',
        op: 'db',
        origin,
        data: expect.objectContaining({
          'sentry.op': 'db',
          'sentry.origin': origin,
          'db.system': 'redis',
          'net.peer.name': 'localhost',
          'net.peer.port': 6380,
          'db.statement': 'set test-key [1 other arguments]',
        }),
      }),
      expect.objectContaining({
        description: 'get test-key',
        op: 'db',
        origin,
        data: expect.objectContaining({
          'sentry.op': 'db',
          'sentry.origin': origin,
          'db.system': 'redis',
          'net.peer.name': 'localhost',
          'net.peer.port': 6380,
          'db.statement': 'get test-key',
        }),
      }),
      // a failing command produces a span with an error status
      expect.objectContaining({
        description: 'incr test-key',
        op: 'db',
        status: 'internal_error',
        origin,
        data: expect.objectContaining({
          'sentry.op': 'db',
          'sentry.origin': origin,
          'db.system': 'redis',
          'net.peer.name': 'localhost',
          'net.peer.port': 6380,
          'db.statement': 'incr test-key',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-ioredis.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test(
      'should auto-instrument `ioredis` package when using redis.set() and redis.get()',
      { timeout: 75_000 },
      async () => {
        await createTestRunner()
          .withDockerCompose({ workingDirectory: [__dirname] })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      },
    );
  });
});
