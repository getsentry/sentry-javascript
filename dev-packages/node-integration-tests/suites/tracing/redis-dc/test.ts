import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('redis v5 diagnostics_channel auto instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should create spans for redis v5 commands via diagnostics_channel', { timeout: 60_000 }, async () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Span Redis 5 DC',
      spans: expect.arrayContaining([
        expect.objectContaining({
          op: 'db.redis',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.op': 'db.redis',
            'sentry.origin': 'auto.db.otel.redis',
            'db.system': 'redis',
            'db.statement': 'SET dc-test-key [1 other arguments]',
          }),
        }),
        // cache SET: span name updated to key by cacheResponseHook
        expect.objectContaining({
          description: 'dc-cache:test-key',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SET dc-cache:test-key [1 other arguments]',
            'cache.key': ['dc-cache:test-key'],
            'cache.item_size': 2,
          }),
        }),
        // cache SET with EX option: redis v5 sends SET key value EX 10 as the command
        expect.objectContaining({
          description: 'dc-cache:test-key-ex',
          op: 'cache.put',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'SET dc-cache:test-key-ex [3 other arguments]',
            'cache.key': ['dc-cache:test-key-ex'],
            'cache.item_size': 2,
          }),
        }),
        expect.objectContaining({
          op: 'db.redis',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.op': 'db.redis',
            'sentry.origin': 'auto.db.otel.redis',
            'db.system': 'redis',
            'db.statement': 'GET dc-test-key',
          }),
        }),
        // cache GET (hit)
        expect.objectContaining({
          description: 'dc-cache:test-key',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'GET dc-cache:test-key',
            'cache.hit': true,
            'cache.key': ['dc-cache:test-key'],
            'cache.item_size': 10,
          }),
        }),
        // cache GET (miss)
        expect.objectContaining({
          description: 'dc-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'GET dc-cache:unavailable-data',
            'cache.hit': false,
            'cache.key': ['dc-cache:unavailable-data'],
          }),
        }),
        // MGET: mixed cache/non-cache keys, span name is all keys joined
        expect.objectContaining({
          description: 'dc-test-key, dc-cache:test-key, dc-cache:unavailable-data',
          op: 'cache.get',
          origin: 'auto.db.otel.redis',
          data: expect.objectContaining({
            'sentry.origin': 'auto.db.otel.redis',
            'db.statement': 'MGET [3 other arguments]',
            'cache.hit': true,
            'cache.key': ['dc-test-key', 'dc-cache:test-key', 'dc-cache:unavailable-data'],
          }),
        }),
      ]),
    };

    // node-redis emits a node-redis:connect DC event for the initial connection.
    // That fires before startSpan so it becomes its own root transaction, received after the main one.
    const EXPECTED_CONNECT = {
      transaction: 'redis-connect',
    };

    await createRunner(__dirname, 'scenario-redis-5.js')
      .withDockerCompose({ workingDirectory: [__dirname] })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .expect({ transaction: EXPECTED_CONNECT })
      .start()
      .completed();
  });
});
