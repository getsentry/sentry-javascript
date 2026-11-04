import type * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const setAttribute = vi.fn();
  const addLink = vi.fn();
  const state = { spanCount: 0, recording: true };
  // Valid hex ids, because the SDK parses the stored origin as a `sentry-trace` header.
  const spanContextOf = (n: number) => ({
    traceId: `${n}`.padStart(32, 'a'),
    spanId: `${n}`.padStart(16, 'b'),
    traceFlags: 1,
  });
  return {
    setAttribute,
    addLink,
    state,
    spanContextOf,
    startSpan: vi.fn((_options: unknown, callback: (span: unknown) => unknown) => {
      const n = ++state.spanCount;
      const spanContext = spanContextOf(n);
      const recording = state.recording;
      let ended = false;
      const result = callback({
        setAttribute,
        addLink,
        spanContext: () => spanContext,
        isRecording: () => recording && !ended,
      });
      // The span ends when the callback's promise settles, as with `startSpan`.
      void Promise.resolve(result).then(
        () => (ended = true),
        () => (ended = true),
      );
      return result;
    }),
    activeSpan: undefined as object | undefined,
    sampled: true,
    client: undefined as { getOptions: () => { traceLifecycle?: 'static' | 'stream' } } | undefined,
  };
});

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  getClient: () => mocks.client,
  getActiveSpan: () => mocks.activeSpan,
  spanIsSampled: () => mocks.sampled,
  startSpan: mocks.startSpan,
}));

import { _instrumentUseCacheHandlers } from '../../src/server/useCacheInstrumentation';

const NEXT_CACHE_HANDLERS_MAP = Symbol.for('@next/cache-handlers-map');
const NEXT_PRIVATE_CACHE_HANDLER = Symbol.for('@next/cache-handlers-private');
const NEXT_MANIFESTS_SINGLETON = Symbol.for('next.server.manifests');
const SENTRY_CACHE_INSTRUMENTED = Symbol.for('sentry.nextjs.cacheHandlersInstrumented');
const SENTRY_WRAPPED_HANDLERS = Symbol.for('sentry.nextjs.wrappedCacheHandlers');
const SENTRY_CACHE_ORIGINS = Symbol.for('sentry.nextjs.cacheOrigins');

function createHandler(entry?: unknown) {
  return {
    get: vi.fn(() => Promise.resolve(entry)),
    set: vi.fn(() => Promise.resolve()),
  };
}

/** Keeps the entry object it gets, like Next.js' built-in in-memory handler. */
function createMemoryHandler() {
  let stored: unknown;
  return {
    get: vi.fn((_key: string) => Promise.resolve(stored)),
    set: vi.fn(async (_key: string, pendingEntry: Promise<unknown>) => {
      stored = await pendingEntry;
    }),
  };
}

/** Stores the entry as JSON in a store that all instances share. */
function createSharedStoreHandler() {
  let stored: string | undefined;
  return {
    get: vi.fn((_key: string) => Promise.resolve(stored === undefined ? undefined : JSON.parse(stored))),
    set: vi.fn(async (_key: string, pendingEntry: Promise<unknown>) => {
      stored = JSON.stringify(await pendingEntry);
    }),
  };
}

/** Stores only the entry fields it knows, so the patched origin is lost. */
function createFieldPickingHandler(entry: { timestamp?: number; expire?: number }) {
  return {
    get: vi.fn((_key: string) => Promise.resolve({ timestamp: entry.timestamp, expire: entry.expire })),
    set: vi.fn((_key: string, pendingEntry: Promise<unknown>) => pendingEntry.then(() => undefined)),
  };
}

function installHandlers(handlers: Record<string, unknown>): void {
  setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map(Object.entries(handlers)));
  _instrumentUseCacheHandlers();
}

/** A hit served by another instance starts with an empty origin table. */
function simulateNewServerInstance(): void {
  Reflect.deleteProperty(globalThis, SENTRY_CACHE_ORIGINS);
}

function setGlobal(symbol: symbol, value: unknown): void {
  (globalThis as Record<symbol, unknown>)[symbol] = value;
}

function installWithDefaultHandler(entry?: unknown) {
  const handler = createHandler(entry);
  installHandlers({ default: handler });
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
    mocks.client = undefined;
    mocks.state.spanCount = 0;
    mocks.state.recording = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // The instrumentation intentionally leaves guards and accessors on `globalThis`; tests have
    // to reset them to get a fresh install each time.
    for (const symbol of [
      NEXT_CACHE_HANDLERS_MAP,
      NEXT_PRIVATE_CACHE_HANDLER,
      NEXT_MANIFESTS_SINGLETON,
      SENTRY_CACHE_INSTRUMENTED,
      SENTRY_WRAPPED_HANDLERS,
      SENTRY_CACHE_ORIGINS,
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

  it('names spans with the low-cardinality op when span streaming is enabled', async () => {
    mocks.client = { getOptions: () => ({ traceLifecycle: 'stream' }) };
    const handler = installWithDefaultHandler();

    await handler.get('cache-key');
    await handler.set('cache-key', Promise.resolve({}));

    // The key digest stays on `cache.key`, where Relay reads the span description from.
    expect(mocks.startSpan).toHaveBeenCalledWith(
      {
        op: 'cache.get',
        name: 'cache.get',
        attributes: {
          'sentry.origin': 'auto.cache.nextjs',
          'cache.key': [expect.stringMatching(/^[0-9a-f]{12}$/)],
          'cache.operation': 'get',
        },
      },
      expect.any(Function),
    );
    expect(mocks.startSpan).toHaveBeenCalledWith(
      {
        op: 'cache.put',
        name: 'cache.put',
        attributes: {
          'sentry.origin': 'auto.cache.nextjs',
          'cache.key': [expect.stringMatching(/^[0-9a-f]{12}$/)],
          'cache.operation': 'put',
        },
      },
      expect.any(Function),
    );
  });

  describe('origin links', () => {
    const originLink = (n: number) => ({
      context: mocks.spanContextOf(n),
      attributes: { 'sentry.link.type': 'cache_origin' },
    });

    it('links a cache hit to the `cache.put` span of the fill', async () => {
      const entry = { timestamp: nowMs() };
      const handler = installWithDefaultHandler(entry);

      await handler.set('cache-key', Promise.resolve(entry));
      await handler.get('cache-key');

      expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith(originLink(1));
    });

    it('links a hit served by another instance from the origin stored on the entry', async () => {
      const handler = createSharedStoreHandler();
      installHandlers({ remote: handler });

      await handler.set('cache-key', Promise.resolve({ timestamp: nowMs() }));
      simulateNewServerInstance();
      await handler.get('cache-key');

      expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith(originLink(1));
    });

    it('does not link a hit served by another instance after an unsampled refill', async () => {
      const handler = createSharedStoreHandler();
      installHandlers({ remote: handler });

      await handler.set('cache-key', Promise.resolve({ timestamp: nowMs() - 1_000 }));
      mocks.sampled = false;
      await handler.set('cache-key', Promise.resolve({ timestamp: nowMs() }));
      mocks.sampled = true;
      simulateNewServerInstance();
      await handler.get('cache-key');

      expect(mocks.addLink).not.toHaveBeenCalled();
    });

    it('patches an entry that resolves after the write resolved', async () => {
      // The handler resolves the write at once and stores the entry later, after the
      // `cache.put` span has ended.
      let stored: object | undefined;
      const handler = {
        get: vi.fn((_key: string) => Promise.resolve(stored)),
        set: vi.fn((_key: string, pendingEntry: Promise<object>) => {
          void pendingEntry.then(entry => (stored = { ...entry }));
          return Promise.resolve();
        }),
      };
      installHandlers({ remote: handler });
      let resolveEntry: (entry: object) => void = () => undefined;

      await handler.set('cache-key', new Promise(resolve => (resolveEntry = resolve)));
      resolveEntry({});
      await new Promise(resolve => setImmediate(resolve));
      simulateNewServerInstance();
      await handler.get('cache-key');

      expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith(originLink(1));
    });

    it('patches the entry before a handler that copies it in its own `then`', async () => {
      let stored: object | undefined;
      const handler = {
        get: vi.fn((_key: string) => Promise.resolve(stored)),
        set: vi.fn((_key: string, pendingEntry: Promise<object>) =>
          pendingEntry.then(entry => {
            stored = { ...entry };
          }),
        ),
      };
      installHandlers({ default: handler });

      await handler.set('cache-key', Promise.resolve({}));
      simulateNewServerInstance();
      await handler.get('cache-key');

      expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith(originLink(1));
    });

    it('links to the most recent fill', async () => {
      const entry = { timestamp: nowMs() };
      const handler = installWithDefaultHandler(entry);

      await handler.set('cache-key', Promise.resolve({ timestamp: entry.timestamp - 1_000 }));
      await handler.set('cache-key', Promise.resolve(entry));
      await handler.get('cache-key');

      expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith(originLink(2));
    });

    it('does not link a miss', async () => {
      const handler = installWithDefaultHandler(undefined);

      await handler.set('cache-key', Promise.resolve({ timestamp: nowMs() }));
      await handler.get('cache-key');

      expect(mocks.addLink).not.toHaveBeenCalled();
    });

    it('does not link a hit whose fill is unknown', async () => {
      const handler = installWithDefaultHandler({ timestamp: nowMs() });

      await handler.get('cache-key');

      expect(mocks.addLink).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'not a string', storedOrigin: 42 },
      { name: 'malformed', storedOrigin: 'not-a-sentry-trace-header' },
      { name: 'an unsampled fill', storedOrigin: `${'a'.repeat(32)}-${'b'.repeat(16)}-0` },
    ])('does not link a hit whose stored origin is $name', async ({ storedOrigin }) => {
      const handler = installWithDefaultHandler({ timestamp: nowMs(), __sentryCacheOrigin: storedOrigin });

      await handler.get('cache-key');

      expect(mocks.addLink).not.toHaveBeenCalled();
    });

    it('does not link a hit on an entry refilled without a sampled parent span', async () => {
      const refill = { timestamp: nowMs() };
      const handler = installWithDefaultHandler(refill);

      await handler.set('cache-key', Promise.resolve({ timestamp: refill.timestamp - 1_000 }));

      mocks.activeSpan = undefined;
      await handler.set('cache-key', Promise.resolve(refill));
      mocks.activeSpan = {};

      await handler.get('cache-key');

      expect(mocks.addLink).not.toHaveBeenCalled();
    });

    it('does not link a hit on an entry whose refill `cache.put` span is not recording', async () => {
      const refill = { timestamp: nowMs() };
      const handler = installWithDefaultHandler(refill);

      await handler.set('cache-key', Promise.resolve({ timestamp: refill.timestamp - 1_000 }));

      // e.g. the `cache.put` op is filtered via `ignoreSpans`
      mocks.state.recording = false;
      await handler.set('cache-key', Promise.resolve(refill));
      mocks.state.recording = true;

      await handler.get('cache-key');

      expect(mocks.addLink).not.toHaveBeenCalled();
    });

    it('does not link a hit on an entry refilled by an uninstrumented server instance', async () => {
      const entryFromOtherInstance = { timestamp: nowMs() };
      const handler = installWithDefaultHandler(entryFromOtherInstance);

      await handler.set('cache-key', Promise.resolve({ timestamp: entryFromOtherInstance.timestamp - 1_000 }));
      await handler.get('cache-key');

      expect(mocks.addLink).not.toHaveBeenCalled();
    });

    it('does not cause an unhandled rejection when the handler fails without reading a failed entry', async () => {
      const handler = { get: vi.fn(), set: vi.fn(() => Promise.reject(new Error('store unavailable'))) };
      installHandlers({ default: handler });
      const onUnhandledRejection = vi.fn();
      process.on('unhandledRejection', onUnhandledRejection);

      try {
        const failedEntry = Promise.reject(new Error('cached function failed'));
        failedEntry.catch(() => undefined);
        await expect(handler.set('cache-key', failedEntry)).rejects.toThrow('store unavailable');
        await new Promise(resolve => setImmediate(resolve));
      } finally {
        process.off('unhandledRejection', onUnhandledRejection);
      }

      expect(onUnhandledRejection).not.toHaveBeenCalled();
    });

    describe('origin table fallback', () => {
      it('links a hit on the filling instance when the handler drops the stored origin', async () => {
        const entry = { timestamp: nowMs() };
        const handler = createFieldPickingHandler(entry);
        installHandlers({ default: handler });

        await handler.set('cache-key', Promise.resolve(entry));
        await handler.get('cache-key');

        expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith(originLink(1));
      });

      it('still writes and links an entry that cannot be patched', async () => {
        const handler = createMemoryHandler();
        installHandlers({ default: handler });

        await handler.set('cache-key', Promise.resolve(Object.freeze({ timestamp: nowMs() })));
        await handler.get('cache-key');

        expect(mocks.addLink).toHaveBeenCalledExactlyOnceWith(originLink(1));
      });

      it('does not link a hit to a fill of the same cache key in a different handler', async () => {
        const entry = { timestamp: nowMs() };
        const defaultHandler = createFieldPickingHandler(entry);
        const remoteHandler = createFieldPickingHandler(entry);
        installHandlers({ default: defaultHandler, remote: remoteHandler });

        await defaultHandler.set('cache-key', Promise.resolve(entry));
        await remoteHandler.get('cache-key');

        expect(mocks.addLink).not.toHaveBeenCalled();

        await defaultHandler.get('cache-key');

        expect(mocks.addLink).toHaveBeenCalledTimes(1);
      });

      it('does not link a hit that was filled under a different cache key', async () => {
        const entry = { timestamp: nowMs() };
        const handler = createFieldPickingHandler(entry);
        installHandlers({ default: handler });

        await handler.set('other-key', Promise.resolve(entry));
        await handler.get('cache-key');

        expect(mocks.addLink).not.toHaveBeenCalled();
      });

      it('does not remember fills whose entry carries no fill timestamp', async () => {
        const entry = { expire: 3_600 };
        const handler = createFieldPickingHandler(entry);
        installHandlers({ default: handler });

        await handler.set('cache-key', Promise.resolve(entry));
        await handler.get('cache-key');

        expect(mocks.addLink).not.toHaveBeenCalled();
      });

      it('does not remember fills whose entry rejected even though the write resolved', async () => {
        // Custom handlers can swallow a failed entry and resolve the write anyway.
        const handler = installWithDefaultHandler({ timestamp: nowMs() });

        await handler.set('cache-key', Promise.reject(new Error('entry failed')));
        await handler.get('cache-key');

        expect(mocks.addLink).not.toHaveBeenCalled();
      });

      it('does not remember fills whose write failed', async () => {
        const entry = { timestamp: nowMs() };
        const handler = {
          get: vi.fn(() => Promise.resolve({ timestamp: entry.timestamp })),
          set: vi.fn(() => Promise.reject(new Error('write failed'))),
        };
        installHandlers({ default: handler });

        await expect(handler.set('cache-key', Promise.resolve(entry))).rejects.toThrow('write failed');
        await handler.get('cache-key');

        expect(mocks.addLink).not.toHaveBeenCalled();
      });
    });
  });

  describe('source file on `cache.put`', () => {
    const functionId = 'c05120808bb68f6400d039e720226869fb1f079019';
    const jsonCacheKey = JSON.stringify(['build-id', functionId, [['arg'], {}]]);

    function setManifest(filename: unknown): void {
      setGlobal(NEXT_MANIFESTS_SINGLETON, {
        serverActionsManifest: { node: { [functionId]: { filename } } },
      });
    }

    it('starts the `cache.put` span with `code.file.path` when the key parses and the manifest knows the function', async () => {
      setManifest('app/(cached-nesting)/mixed-lifetimes/[id]/layout.tsx');
      const handler = installWithDefaultHandler();

      await handler.set(jsonCacheKey, Promise.resolve({}));

      // In the start options (not set afterwards), so samplers and span processors see it.
      expect(mocks.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          op: 'cache.put',
          attributes: expect.objectContaining({
            'code.file.path': 'app/(cached-nesting)/mixed-lifetimes/[id]/layout.tsx',
          }),
        }),
        expect.any(Function),
      );
    });

    it('does not put `code.file.path` on `cache.get` spans', async () => {
      setManifest('app/page.tsx');
      const handler = installWithDefaultHandler({ timestamp: nowMs() });

      await handler.get(jsonCacheKey);

      expect(mocks.startSpan).not.toHaveBeenCalledWith(
        expect.objectContaining({ attributes: expect.objectContaining({ 'code.file.path': expect.anything() }) }),
        expect.any(Function),
      );
      expect(mocks.setAttribute).not.toHaveBeenCalledWith('code.file.path', expect.anything());
    });

    // Key parsing, manifest lookup, and path shortening are covered in `useCacheSourceFile.test.ts`.
    it('still writes the entry and omits `code.file.path` when the key does not resolve', async () => {
      setManifest('app/page.tsx');
      const handler = installWithDefaultHandler();

      await expect(handler.set('multipart-encoded-key', Promise.resolve({}))).resolves.toBeUndefined();

      expect(mocks.startSpan).not.toHaveBeenCalledWith(
        expect.objectContaining({ attributes: expect.objectContaining({ 'code.file.path': expect.anything() }) }),
        expect.any(Function),
      );
      expect(mocks.setAttribute).not.toHaveBeenCalledWith('code.file.path', expect.anything());
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
