import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('redis auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test(
    'should auto-instrument `ioredis` package when using redis.set() and redis.get()',
    { timeout: 75_000 },
    async () => {
      const EXPECTED_TRANSACTION = {
        transaction: 'Test Span',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'set test-key [1 other arguments]',
            op: 'db',
            origin: 'auto.db.otel.redis',
            data: expect.objectContaining({
              'sentry.op': 'db',
              'sentry.origin': 'auto.db.otel.redis',
              'db.system': 'redis',
              'net.peer.name': 'localhost',
              'net.peer.port': 6379,
              'db.statement': 'set test-key [1 other arguments]',
            }),
          }),
          expect.objectContaining({
            description: 'get test-key',
            op: 'db',
            origin: 'auto.db.otel.redis',
            data: expect.objectContaining({
              'sentry.op': 'db',
              'sentry.origin': 'auto.db.otel.redis',
              'db.system': 'redis',
              'net.peer.name': 'localhost',
              'net.peer.port': 6379,
              'db.statement': 'get test-key',
            }),
          }),
        ]),
      };

      await createRunner(__dirname, 'scenario-ioredis.js')
        .withDockerCompose({ workingDirectory: [__dirname], readyMatches: ['port=6379'] })
        .expect({ transaction: EXPECTED_TRANSACTION })
        .start()
        .completed();
    },
  );
});
