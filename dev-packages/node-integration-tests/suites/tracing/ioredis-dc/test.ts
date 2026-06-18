import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('ioredis v5.11 diagnostics_channel auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Span IORedis 5.11 DC',
    spans: expect.arrayContaining([
      expect.objectContaining({
        op: 'db.redis',
        origin: 'auto.db.redis.diagnostic_channel',
        data: expect.objectContaining({
          'sentry.op': 'db.redis',
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
        op: 'db.redis',
        origin: 'auto.db.redis.diagnostic_channel',
        data: expect.objectContaining({
          'sentry.op': 'db.redis',
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
        op: 'db.redis',
        origin: 'auto.db.redis.diagnostic_channel',
        data: expect.objectContaining({
          'sentry.op': 'db.redis',
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
        .withDockerCompose({ workingDirectory: [__dirname] })
        .expect({ transaction: EXPECTED_CONNECT })
        .expect({ transaction: EXPECTED_TRANSACTION })
        .start()
        .completed();
    });
  });
});
