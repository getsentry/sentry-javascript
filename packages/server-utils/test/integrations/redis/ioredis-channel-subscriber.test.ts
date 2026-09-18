import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { startIORedisCommandSpan } from '../../../src/integrations/redis/ioredis-channel-subscriber';

const CONNECTION = { host: 'localhost', port: 6379 };

function ctx(
  command: unknown,
  connection: { host?: string; port?: number } = CONNECTION,
): { arguments: unknown[]; self: { options: { host?: string; port?: number } } } {
  return { arguments: [command], self: { options: connection } };
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
    startIORedisCommandSpan(ctx({ name: 'set', args: ['test-key', 'test-value'] }), {});

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

  it('starts the span as a cache span when the key matches a cache prefix', () => {
    startIORedisCommandSpan(ctx({ name: 'get', args: ['ioredis-cache:test-key'] }), {
      cachePrefixes: ['ioredis-cache:'],
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ioredis-cache:test-key',
        attributes: expect.objectContaining({
          'sentry.op': 'cache.get',
          'cache.operation': 'get',
          'cache.key': ['ioredis-cache:test-key'],
          'network.peer.address': 'localhost',
          'network.peer.port': 6379,
        }),
      }),
    );
  });

  it('names the span from the conventions with span streaming enabled', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ traceLifecycle: 'stream' }),
    } as unknown as ReturnType<typeof SentryCore.getClient>);

    startIORedisCommandSpan(ctx({ name: 'set', args: ['test-key', 'test-value'] }), {});

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        // `{db.operation.name} {server.address}:{server.port}` — redis has no collection or namespace
        name: 'set localhost:6379',
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

    startIORedisCommandSpan(ctx({ name: 'fcall', args: ['my_func', '1', 'test-key'] }), {});

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        // `{db.operation.name} {db.stored_procedure.name}` — the conventions rank the stored
        // procedure ahead of the connection, so it wins over `{server.address}:{server.port}`
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

    startIORedisCommandSpan(ctx({ name: 'fcall', args: ['?', '1', 'test-key'] }), {});

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'fcall localhost:6379',
        attributes: expect.not.objectContaining({ 'db.stored_procedure.name': expect.anything() }),
      }),
    );
  });

  it('falls back to the db system name when the client has no host', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ traceLifecycle: 'stream' }),
    } as unknown as ReturnType<typeof SentryCore.getClient>);

    startIORedisCommandSpan(ctx({ name: 'set', args: ['test-key', 'test-value'] }, { port: 6379 }), {});

    // `{db.system.name}` — the address/port template needs both halves
    expect(startInactiveSpanSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'redis' }));
  });

  it('emits a single span when the same command is re-sent from the offline queue', () => {
    const command = { name: 'set', args: ['test-key', 'test-value'] };

    expect(startIORedisCommandSpan(ctx(command), {})).toBeDefined();
    expect(startIORedisCommandSpan(ctx(command), {})).toBeUndefined();
    expect(startInactiveSpanSpy).toHaveBeenCalledTimes(1);
  });

  it('spans distinct command objects with the same statement', () => {
    startIORedisCommandSpan(ctx({ name: 'get', args: ['k'] }), {});
    startIORedisCommandSpan(ctx({ name: 'get', args: ['k'] }), {});

    expect(startInactiveSpanSpy).toHaveBeenCalledTimes(2);
  });

  it('skips payloads without a command object', () => {
    expect(startIORedisCommandSpan({ arguments: [], self: { options: CONNECTION } }, {})).toBeUndefined();
    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });
});
