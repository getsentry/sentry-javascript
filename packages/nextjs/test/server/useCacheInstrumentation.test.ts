import type * as SentryCore from '@sentry/core';
import type { Span, StartSpanOptions } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RecordedSpan {
  options: StartSpanOptions;
  attributes: Record<string, unknown>;
}

const recordedSpans: RecordedSpan[] = [];

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal<typeof SentryCore>();
  return {
    ...original,
    getClient: () => undefined,
    startSpan: <T>(options: StartSpanOptions, callback: (span: Span) => T): T => {
      const recorded: RecordedSpan = { options, attributes: { ...options.attributes } };
      recordedSpans.push(recorded);
      const span = {
        setAttribute: (key: string, value: unknown) => {
          recorded.attributes[key] = value;
        },
      } as unknown as Span;
      return callback(span);
    },
  };
});

import { instrumentUseCacheHandlers } from '../../src/server/useCacheInstrumentation';

const NEXT_CACHE_HANDLERS_MAP = Symbol.for('@next/cache-handlers-map');
const NEXT_PRIVATE_CACHE_HANDLER = Symbol.for('@next/cache-handlers-private');
const SENTRY_CACHE_INSTRUMENTED = Symbol.for('sentry.nextjs.cacheHandlersInstrumented');

function createHandler(entry?: unknown) {
  return {
    get: vi.fn(() => Promise.resolve(entry)),
    set: vi.fn(() => Promise.resolve()),
  };
}

function setGlobal(symbol: symbol, value: unknown): void {
  (globalThis as Record<symbol, unknown>)[symbol] = value;
}

describe('instrumentUseCacheHandlers', () => {
  beforeEach(() => {
    recordedSpans.length = 0;
  });

  afterEach(() => {
    // The instrumentation intentionally leaves guards and accessors on `globalThis`; tests have
    // to reset them to get a fresh install each time.
    for (const symbol of [NEXT_CACHE_HANDLERS_MAP, NEXT_PRIVATE_CACHE_HANDLER, SENTRY_CACHE_INSTRUMENTED]) {
      Reflect.deleteProperty(globalThis, symbol);
    }
  });

  it('wraps handlers that are already registered at init (`next start` ordering)', async () => {
    const handler = createHandler();
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));

    instrumentUseCacheHandlers();
    await handler.get('cache-key');

    expect(recordedSpans).toHaveLength(1);
    expect(recordedSpans[0]?.options).toMatchObject({
      op: 'cache.get',
      onlyIfParent: true,
      name: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
    expect(recordedSpans[0]?.attributes).toMatchObject({
      'sentry.origin': 'auto.cache.nextjs',
      'cache.operation': 'get',
      'cache.key': [recordedSpans[0]?.options.name],
    });
  });

  it('wraps handlers when the registry is assigned after init (dev server ordering)', async () => {
    instrumentUseCacheHandlers();

    const handler = createHandler();
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
    await handler.get('cache-key');

    expect(recordedSpans).toHaveLength(1);
  });

  it('wraps handlers that are added to the registry later (`setCacheHandler`)', async () => {
    const handlersMap = new Map();
    setGlobal(NEXT_CACHE_HANDLERS_MAP, handlersMap);
    instrumentUseCacheHandlers();

    const handler = createHandler();
    handlersMap.set('custom', handler);
    await handler.get('cache-key');

    expect(recordedSpans).toHaveLength(1);
  });

  it('wraps the private dev cache handler', async () => {
    instrumentUseCacheHandlers();

    const handler = createHandler();
    setGlobal(NEXT_PRIVATE_CACHE_HANDLER, handler);
    await handler.get('cache-key');

    expect(recordedSpans).toHaveLength(1);
  });

  it('does not double-wrap on repeated init', async () => {
    const handler = createHandler();
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));

    instrumentUseCacheHandlers();
    instrumentUseCacheHandlers();
    await handler.get('cache-key');

    expect(recordedSpans).toHaveLength(1);
  });

  it('ignores registry values that are not cache handlers', () => {
    setGlobal(NEXT_CACHE_HANDLERS_MAP, 'not-a-map');
    setGlobal(NEXT_PRIVATE_CACHE_HANDLER, { get: () => Promise.resolve() });

    expect(() => instrumentUseCacheHandlers()).not.toThrow();
    expect(recordedSpans).toHaveLength(0);
  });

  it('reports a miss when the handler returns no entry', async () => {
    const handler = createHandler(undefined);
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
    instrumentUseCacheHandlers();

    await handler.get('cache-key');

    expect(recordedSpans[0]?.attributes).toMatchObject({ 'cache.hit': false });
    expect(recordedSpans[0]?.attributes).not.toHaveProperty('cache.item_age');
  });

  it('reports a hit with entry metadata for a fresh entry', async () => {
    const handler = createHandler({
      timestamp: Date.now() - 5_000,
      expire: 3_600,
      tags: ['tag-a', 'tag-b'],
    });
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
    instrumentUseCacheHandlers();

    await handler.get('cache-key');

    expect(recordedSpans[0]?.attributes).toMatchObject({
      'cache.hit': true,
      'cache.item_age': 5,
      'cache.ttl': 3_600,
      'cache.tags': ['tag-a', 'tag-b'],
    });
  });

  it('reports a miss for an entry past its hard expire limit', async () => {
    const handler = createHandler({ timestamp: Date.now() - 120_000, expire: 60 });
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
    instrumentUseCacheHandlers();

    await handler.get('cache-key');

    expect(recordedSpans[0]?.attributes).toMatchObject({
      'cache.hit': false,
      'cache.item_age': 120,
    });
  });

  it('omits `cache.ttl` for entries that never expire', async () => {
    const handler = createHandler({ timestamp: Date.now(), expire: 0xfffffffe });
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
    instrumentUseCacheHandlers();

    await handler.get('cache-key');

    expect(recordedSpans[0]?.attributes).toMatchObject({ 'cache.hit': true });
    expect(recordedSpans[0]?.attributes).not.toHaveProperty('cache.ttl');
  });

  it('creates a `cache.put` span around handler writes', async () => {
    const handler = createHandler();
    setGlobal(NEXT_CACHE_HANDLERS_MAP, new Map([['default', handler]]));
    instrumentUseCacheHandlers();

    await handler.set('cache-key', Promise.resolve({}));

    expect(recordedSpans).toHaveLength(1);
    expect(recordedSpans[0]?.options).toMatchObject({ op: 'cache.put' });
    expect(recordedSpans[0]?.attributes).toMatchObject({ 'cache.operation': 'put' });
  });
});
