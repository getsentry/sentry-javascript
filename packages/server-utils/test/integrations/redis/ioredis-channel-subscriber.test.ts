import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { startIORedisCommandSpan } from '../../../src/integrations/redis/ioredis-channel-subscriber';

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

  it('builds a db query span with Sentry convention attributes', () => {
    startIORedisCommandSpan(ctx({ name: 'set', args: ['test-key', 'test-value'] }));

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'set test-key [1 other arguments]',
        attributes: expect.objectContaining({
          'sentry.op': 'db.query',
          'db.system.name': 'redis',
          'db.operation.name': 'set',
          'db.query.text': 'set test-key [1 other arguments]',
          'server.address': 'localhost',
          'server.port': 6379,
          'sentry.origin': 'auto.db.redis',
        }),
      }),
    );
  });

  it('names the span from the conventions with span streaming enabled', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ traceLifecycle: 'stream' }),
    } as unknown as ReturnType<typeof SentryCore.getClient>);

    startIORedisCommandSpan(ctx({ name: 'set', args: ['test-key', 'test-value'] }));

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        // `{db.operation.name}` — redis has nothing low cardinality to pair the operation with
        name: 'set',
        // the serialized statement, which carries the key, is still reported as an attribute
        attributes: expect.objectContaining({
          'db.query.text': 'set test-key [1 other arguments]',
        }),
      }),
    );
  });

  it('names the span after the redis function it calls with span streaming enabled', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ traceLifecycle: 'stream' }),
    } as unknown as ReturnType<typeof SentryCore.getClient>);

    startIORedisCommandSpan(ctx({ name: 'fcall', args: ['my_func', '1', 'test-key'] }));

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        // `{db.operation.name} {db.stored_procedure.name}` — a redis function is named, so unlike
        // an ordinary command it has a low cardinality second token to pair with
        name: 'fcall my_func',
        attributes: expect.objectContaining({
          'db.stored_procedure.name': 'my_func',
        }),
      }),
    );
  });

  it('leaves the stored procedure unset when the function name was redacted', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ traceLifecycle: 'stream' }),
    } as unknown as ReturnType<typeof SentryCore.getClient>);

    startIORedisCommandSpan(ctx({ name: 'fcall', args: ['?', '1', 'test-key'] }));

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'fcall',
        attributes: expect.not.objectContaining({ 'db.stored_procedure.name': expect.anything() }),
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
