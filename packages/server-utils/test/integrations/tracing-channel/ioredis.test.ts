import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { startIORedisCommandSpan } from '../../../src/integrations/tracing-channel/ioredis';

const CONNECTION = { host: 'localhost', port: 6379 };

function ctx(command: unknown): { arguments: unknown[]; self: { options: typeof CONNECTION } } {
  return { arguments: [command], self: { options: CONNECTION } };
}

describe('startIORedisCommandSpan', () => {
  let startInactiveSpanSpy: MockInstance;

  beforeEach(() => {
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue({} as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a db span with the orchestrion origin and stable db/net attributes', () => {
    startIORedisCommandSpan(ctx({ name: 'set', args: ['test-key', 'test-value'] }));

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'set test-key [1 other arguments]',
        op: 'db',
        attributes: expect.objectContaining({
          'db.system': 'redis',
          'db.connection_string': 'redis://localhost:6379',
          'server.address': 'localhost',
          'server.port': 6379,
          'db.statement': 'set test-key [1 other arguments]',
          'sentry.origin': 'auto.db.redis',
        }),
      }),
    );
  });

  it('emits a single span when the same command is re-sent from the offline queue', () => {
    const command = { name: 'set', args: ['test-key', 'test-value'] };

    expect(startIORedisCommandSpan(ctx(command))).toBeDefined();
    expect(startIORedisCommandSpan(ctx(command))).toBeUndefined();
    expect(startInactiveSpanSpy).toHaveBeenCalledTimes(1);
  });

  it('spans distinct command objects with the same statement', () => {
    startIORedisCommandSpan(ctx({ name: 'get', args: ['k'] }));
    startIORedisCommandSpan(ctx({ name: 'get', args: ['k'] }));

    expect(startInactiveSpanSpy).toHaveBeenCalledTimes(2);
  });

  it('skips payloads without a command object', () => {
    expect(startIORedisCommandSpan({ arguments: [], self: { options: CONNECTION } })).toBeUndefined();
    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });
});
