import {
  CACHE_HIT,
  CACHE_KEY,
  CACHE_OPERATION,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import type * as SentryCore from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { instrumentCacheStorage } from '../../../src/runtime/utils/instrumentStorage';

const { captureExceptionMock, setAttributeMock, startSpanMock } = vi.hoisted(() => {
  const setAttributeMock = vi.fn();
  return {
    captureExceptionMock: vi.fn(),
    setAttributeMock,
    startSpanMock: vi.fn((_options: unknown, callback: (span: unknown) => unknown) =>
      callback({ setAttribute: setAttributeMock, setStatus: vi.fn() }),
    ),
  };
});

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  captureException: captureExceptionMock,
  startSpan: startSpanMock,
}));

function createStorage(entries: Record<string, unknown> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    binary: true,
    get: vi.fn((key: string) => map.get(key) ?? null),
    set: vi.fn((key: string, value: unknown, _opts?: { ttl?: number }) => void map.set(key, value)),
  };
}

const KEY = '/cache:nitrofunctions.abc:getUser:user:1.json';

describe('instrumentCacheStorage', () => {
  it('traces reads and records a fresh entry as a cache hit', async () => {
    const entry = { value: { id: 1 }, expires: Date.now() + 60_000 };
    const storage = instrumentCacheStorage(createStorage({ [KEY]: entry }), 'memory');

    await expect(storage.get(KEY)).resolves.toBe(entry);

    expect(startSpanMock).toHaveBeenLastCalledWith(
      {
        name: KEY,
        attributes: {
          [SENTRY_OP]: CACHE_GET,
          [CACHE_OPERATION]: 'get',
          [SENTRY_ORIGIN]: 'auto.cache.nuxt',
          [CACHE_KEY]: KEY,
          [DB_OPERATION_NAME]: 'get',
          [DB_SYSTEM_NAME]: 'memory',
        },
      },
      expect.any(Function),
    );
    expect(setAttributeMock).toHaveBeenLastCalledWith(CACHE_HIT, true);
  });

  it.each([
    ['a missing entry', undefined],
    ['an expired entry', { value: { id: 1 }, expires: Date.now() - 1 }],
    ['a stale entry', { value: { id: 1 }, expires: Date.now() + 60_000, stale: true }],
  ])('records %s as a cache miss', async (_, entry) => {
    const storage = instrumentCacheStorage(createStorage(entry ? { [KEY]: entry } : {}), 'memory');

    await storage.get(KEY);

    expect(setAttributeMock).toHaveBeenLastCalledWith(CACHE_HIT, false);
  });

  it('traces writes, and writes of `null` as removals', async () => {
    const original = createStorage();
    const originalSet = original.set;
    const storage = instrumentCacheStorage(original, 'fs');

    await storage.set(KEY, { value: 1 }, { ttl: 60 });
    expect(originalSet).toHaveBeenLastCalledWith(KEY, { value: 1 }, { ttl: 60 });
    expect(startSpanMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ [SENTRY_OP]: CACHE_PUT, [DB_OPERATION_NAME]: 'set' }),
      }),
      expect.any(Function),
    );

    await storage.set(KEY, null);
    expect(startSpanMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ attributes: expect.objectContaining({ [SENTRY_OP]: CACHE_REMOVE }) }),
      expect.any(Function),
    );
  });

  it('captures and rethrows a failed operation', async () => {
    const error = new Error('storage unavailable');
    const original = createStorage();
    original.get.mockRejectedValueOnce(error);
    const storage = instrumentCacheStorage(original, 'memory');
    setAttributeMock.mockClear();

    await expect(storage.get(KEY)).rejects.toBe(error);

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.cache.nuxt' },
    });
    expect(setAttributeMock).not.toHaveBeenCalledWith(CACHE_HIT, expect.anything());
  });

  it('patches the storage in place and only once', async () => {
    const original = createStorage();

    const storage = instrumentCacheStorage(instrumentCacheStorage(original, 'memory'), 'memory');
    startSpanMock.mockClear();
    await storage.get(KEY);

    expect(storage).toBe(original);
    expect(storage.binary).toBe(true);
    expect(startSpanMock).toHaveBeenCalledTimes(1);
  });
});
