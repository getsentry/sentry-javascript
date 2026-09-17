import type * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const setAttribute = vi.fn();
  return {
    setAttribute,
    startSpan: vi.fn((_options: unknown, callback: (span: unknown) => unknown) => callback({ setAttribute })),
    activeSpan: undefined as object | undefined,
    sampled: true,
  };
});

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  getClient: () => undefined,
  getActiveSpan: () => mocks.activeSpan,
  spanIsSampled: () => mocks.sampled,
  startSpan: mocks.startSpan,
}));

import { _instrumentUseCacheHandlers } from '../../src/server/useCacheInstrumentation';

const NEXT_CACHE_HANDLERS_MAP = Symbol.for('@next/cache-handlers-map');
const NEXT_PRIVATE_CACHE_HANDLER = Symbol.for('@next/cache-handlers-private');
const SENTRY_CACHE_INSTRUMENTED = Symbol.for('sentry.nextjs.cacheHandlersInstrumented');
const SENTRY_WRAPPED_HANDLERS = Symbol.for('sentry.nextjs.wrappedCacheHandlers');

function createHandler(entry?: unknown) {
  return {
    get: vi.fn(() => Promise.resolve(entry)),
    set: vi.fn(() => Promise.resolve()),
  };
}

function setGlobal(symbol: symbol, value: unknown): void {
  (globalThis as Record<symbol, unknown>)[symbol] = value;
}

function installWithDefaultHandler(entry?: unknown) {
  const handler = createHandler(entry);
  setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
  _instrumentUseCacheHandlers();
  return handler;
}

function nowMs(): number {
  // The clock Next.js uses for `CacheEntry.timestamp`.
  return performance.timeOrigin + performance.now();
}

describe('instrumentUseCacheHandlers', () => {
  beforeEach(() => {
    mocks.activeSpan = {};
    mocks.sampled = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // The instrumentation intentionally leaves guards and accessors on `globalThis`; tests have
    // to reset them to get a fresh install each time.
    for (const symbol of [
      NEXT_CACHE_HANDLERS_MAP,
      NEXT_PRIVATE_CACHE_HANDLER,
      SENTRY_CACHE_INSTRUMENTED,
      SENTRY_WRAPPED_HANDLERS,
    ]) {
      Reflect.deleteProperty(globalThis, symbol);
    }
  });

  describe('installation', () => {
    it('wraps handlers that are already registered at init (`next start` ordering)', async () => {
      const handler = installWithDefaultHandler();

      await handler.get('cache-key');

      expect(mocks.startSpan).toHaveBeenCalledTimes(1);
      expect(mocks.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          op: 'cache.get',
          name: expect.stringMatching(/^[0-9a-f]{12}$/),
          attributes: expect.objectContaining({
            'sentry.origin': 'auto.cache.nextjs',
            'cache.operation': 'get',
            'cache.key': [expect.stringMatching(/^[0-9a-f]{12}$/)],
          }),
        }),
        expect.any(Function),
      );
    });

    it('wraps handlers when the registry is assigned after init (dev server ordering)', async () => {
      _instrumentUseCacheHandlers();

      const handler = createHandler();
      setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
      await handler.get('cache-key');

      expect(mocks.startSpan).toHaveBeenCalledTimes(1);
    });

    it('wraps handlers that are added to the registry later (`setCacheHandler`)', async () => {
      const handlersMap = new Map();
      setGlobal(NEXT_CACHE_HANDLERS_MAP, handlersMap);
      _instrumentUseCacheHandlers();

      const handler = createHandler();
      handlersMap.set('custom', handler);
      await handler.get('cache-key');

      expect(mocks.startSpan).toHaveBeenCalledTimes(1);
    });

    it('wraps the private dev cache handler', async () => {
      _instrumentUseCacheHandlers();

      const handler = createHandler();
      setGlobal(NEXT_PRIVATE_CACHE_HANDLER, handler);
      await handler.get('cache-key');

      expect(mocks.startSpan).toHaveBeenCalledTimes(1);
    });

    it('does not double-wrap on repeated init', async () => {
      const handler = installWithDefaultHandler();
      _instrumentUseCacheHandlers();

      await handler.get('cache-key');

      expect(mocks.startSpan).toHaveBeenCalledTimes(1);
    });

    it('wraps a handler registered under several kinds only once', async () => {
      const handler = createHandler();
      setGlobal(
        NEXT_CACHE_HANDLERS_MAP,
        new Map([
          ['default', handler],
          ['remote', handler],
        ]),
      );
      _instrumentUseCacheHandlers();

      await handler.get('cache-key');

      expect(mocks.startSpan).toHaveBeenCalledTimes(1);
    });

    it('ignores registry values that are not cache handlers', () => {
      setGlobal(NEXT_CACHE_HANDLERS_MAP, 'not-a-map');
      setGlobal(NEXT_PRIVATE_CACHE_HANDLER, { get: () => Promise.resolve() });

      expect(() => _instrumentUseCacheHandlers()).not.toThrow();
      expect(mocks.startSpan).not.toHaveBeenCalled();
    });
  });

  describe('safety', () => {
    it('still registers a frozen custom handler', () => {
      const handlersMap = new Map();
      setGlobal(NEXT_CACHE_HANDLERS_MAP, handlersMap);
      _instrumentUseCacheHandlers();

      const frozenHandler = Object.freeze(createHandler());

      expect(() => handlersMap.set('custom', frozenHandler)).not.toThrow();
      expect(handlersMap.get('custom')).toBe(frozenHandler);
    });

    it('still registers a handler whose property access throws', () => {
      const handlersMap = new Map();
      setGlobal(NEXT_CACHE_HANDLERS_MAP, handlersMap);
      _instrumentUseCacheHandlers();

      const throwingHandler = new Proxy(
        {},
        {
          get() {
            throw new Error('unexpected property access');
          },
        },
      );

      expect(() => handlersMap.set('custom', throwingHandler)).not.toThrow();
      expect(handlersMap.get('custom')).toBe(throwingHandler);
    });

    it('skips all span work without an active span', async () => {
      mocks.activeSpan = undefined;
      const entry = { timestamp: nowMs() };
      const handler = installWithDefaultHandler(entry);

      await expect(handler.get('cache-key')).resolves.toBe(entry);
      await handler.set('cache-key', Promise.resolve({}));

      expect(mocks.startSpan).not.toHaveBeenCalled();
    });

    it('skips all span work when the active span is not sampled', async () => {
      mocks.sampled = false;
      const handler = installWithDefaultHandler();

      await handler.get('cache-key');

      expect(mocks.startSpan).not.toHaveBeenCalled();
    });

    it('supports custom handlers that return the entry synchronously', async () => {
      const entry = { timestamp: nowMs() };
      const handler = { get: (_cacheKey: string) => entry, set: () => Promise.resolve() };
      setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
      _instrumentUseCacheHandlers();

      await expect(handler.get('cache-key')).resolves.toBe(entry);
      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.hit', true);
    });
  });

  describe('entry attributes', () => {
    it('reports a miss when the handler returns no entry', async () => {
      const handler = installWithDefaultHandler(undefined);

      await handler.get('cache-key');

      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.hit', false);
      expect(mocks.setAttribute).not.toHaveBeenCalledWith('cache.item_age', expect.anything());
    });

    it('reports a hit with entry metadata for a fresh entry', async () => {
      const handler = installWithDefaultHandler({
        timestamp: nowMs() - 5_000,
        expire: 3_600,
        tags: ['tag-a', 42, 'tag-b'],
      });

      await handler.get('cache-key');

      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.hit', true);
      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.item_age', 5);
      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.ttl', 3_600);
      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.tags', ['tag-a', 'tag-b']);
    });

    it('reports a miss for an entry past its hard expire limit', async () => {
      const handler = installWithDefaultHandler({ timestamp: nowMs() - 120_000, expire: 60 });

      await handler.get('cache-key');

      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.hit', false);
      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.item_age', 120);
    });

    it('applies the dev server minimum lifetime before reporting an entry as expired', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const handler = installWithDefaultHandler({ timestamp: nowMs() - 120_000, expire: 60 });

      await handler.get('cache-key');

      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.hit', true);
    });

    it('omits `cache.ttl` for entries that never expire', async () => {
      const handler = installWithDefaultHandler({ timestamp: nowMs(), expire: 0xfffffffe });

      await handler.get('cache-key');

      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.hit', true);
      expect(mocks.setAttribute).not.toHaveBeenCalledWith('cache.ttl', expect.anything());
    });

    it('omits `cache.ttl` for evicted entries', async () => {
      const handler = installWithDefaultHandler({ timestamp: nowMs(), expire: -1 });

      await handler.get('cache-key');

      expect(mocks.setAttribute).toHaveBeenCalledWith('cache.hit', false);
      expect(mocks.setAttribute).not.toHaveBeenCalledWith('cache.ttl', expect.anything());
    });
  });

  it('creates a `cache.put` span around handler writes', async () => {
    const handler = installWithDefaultHandler();

    await handler.set('cache-key', Promise.resolve({}));

    expect(mocks.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'cache.put',
        attributes: expect.objectContaining({ 'cache.operation': 'put' }),
      }),
      expect.any(Function),
    );
  });
});
