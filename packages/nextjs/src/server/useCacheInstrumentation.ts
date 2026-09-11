import { createHash } from 'node:crypto';
import { CACHE_ITEM_AGE, CACHE_OPERATION, CACHE_TAGS, CACHE_TTL } from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  _INTERNAL_safeDateNow,
  CACHE_OPERATION_NAMES,
  debug,
  fill,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';

// Next.js shares its `use cache` handlers across bundles via `globalThis`
// (`next/src/server/use-cache/handlers.ts`). This module can load once per bundle, so all
// double-wrap guards must also live on `globalThis` or on the handler objects.
const NEXT_CACHE_HANDLERS_MAP = Symbol.for('@next/cache-handlers-map');
const NEXT_PRIVATE_CACHE_HANDLER = Symbol.for('@next/cache-handlers-private');
const SENTRY_CACHE_INSTRUMENTED = Symbol.for('sentry.nextjs.cacheHandlersInstrumented');
const SENTRY_HANDLER_WRAPPED = Symbol.for('sentry.nextjs.wrappedCacheHandler');

const CACHE_SPAN_ORIGIN = 'auto.cache.nextjs';

// Next.js' `INFINITE_CACHE` sentinel. An `expire` at or above it means "never expires", which carries no signal as a TTL attribute.
// https://github.com/vercel/next.js/blob/ed1aab5d386d07ee2f553107dd39995251a6e44e/packages/next/src/lib/constants.ts#L43-L46
const NEXT_INFINITE_CACHE = 0xfffffffe;

// Next.js vendored types below: https://github.com/vercel/next.js/blob/ed1aab5d386d07ee2f553107dd39995251a6e44e/packages/next/src/server/lib/cache-handlers/types.ts

// Subset of Next.js' `CacheHandler`
interface UseCacheHandler {
  [SENTRY_HANDLER_WRAPPED]?: boolean;
  get(cacheKey: string, softTags?: string[]): Promise<unknown>;
  set(cacheKey: string, pendingEntry: Promise<unknown>): Promise<void>;
}

// Subset of Next.js' `CacheEntry`. Fields are optional because custom cache handlers control the entry shape.
interface UseCacheEntry {
  /** ms epoch, set to the fill's start time */
  timestamp?: number;
  /** seconds; hard limit after which the entry is discarded on read */
  expire?: number;
  /** `cacheTag()` tags, excluding implicit soft tags */
  tags?: string[];
}

type GlobalWithCacheHandlers = typeof globalThis & {
  [NEXT_CACHE_HANDLERS_MAP]?: Map<string, UseCacheHandler>;
  [NEXT_PRIVATE_CACHE_HANDLER]?: UseCacheHandler;
  [SENTRY_CACHE_INSTRUMENTED]?: boolean;
};

/**
 * Cache keys are long serialized payloads (function id + arguments), so spans carry a digest
 * instead. This bounds span size, avoids leaking user data, and still groups identical keys.
 */
function keyDigest(cacheKey: string): string {
  return createHash('sha1').update(cacheKey).digest('hex').slice(0, 12);
}

function startCacheSpan<T>(op: typeof CACHE_GET | typeof CACHE_PUT, cacheKey: string, callback: (span: Span) => T): T {
  const client = getClient();
  const digest = keyDigest(cacheKey);

  return startSpan(
    {
      // low cardinality name for span streaming
      name: client && hasSpanStreamingEnabled(client) ? op : digest,
      op,
      // Without an active parent span (e.g. a detached worker context), a cache span would become
      // its own orphan transaction. This does not filter background revalidations; those still
      // parent to the serving request's (possibly already finished) root span.
      onlyIfParent: true,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: CACHE_SPAN_ORIGIN,
        [SEMANTIC_ATTRIBUTE_CACHE_KEY]: [digest],
        [CACHE_OPERATION]: CACHE_OPERATION_NAMES[op],
      },
    },
    callback,
  );
}

/**
 * `cache.hit` mirrors Next.js' use-cache wrapper: it discards entries past their hard `expire`
 * limit and re-runs the function, so those count as misses here. Tag-revalidation discards are
 * not detectable at the handler level and still count as hits.
 */
function setEntryAttributes(span: Span, entry: unknown): void {
  if (entry === undefined) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, false);
    return;
  }

  const { timestamp, expire, tags } = (entry ?? {}) as UseCacheEntry;
  const ageMs = typeof timestamp === 'number' ? _INTERNAL_safeDateNow() - timestamp : undefined;
  const isExpired = ageMs !== undefined && typeof expire === 'number' && ageMs > expire * 1000;

  span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, !isExpired);

  if (ageMs !== undefined) {
    // Clamped: with a remote handler, the filling and the reading machine's clocks can drift.
    span.setAttribute(CACHE_ITEM_AGE, Math.max(0, Math.round(ageMs / 1000)));
  }
  if (typeof expire === 'number' && expire < NEXT_INFINITE_CACHE) {
    span.setAttribute(CACHE_TTL, expire);
  }
  if (Array.isArray(tags) && tags.length > 0) {
    span.setAttribute(CACHE_TAGS, tags);
  }
}

function instrumentHandler(handler: unknown): void {
  if (
    !handler ||
    typeof handler !== 'object' ||
    typeof (handler as UseCacheHandler).get !== 'function' ||
    typeof (handler as UseCacheHandler).set !== 'function' ||
    (handler as UseCacheHandler)[SENTRY_HANDLER_WRAPPED]
  ) {
    return;
  }

  const cacheHandler = handler as UseCacheHandler;
  cacheHandler[SENTRY_HANDLER_WRAPPED] = true;

  fill(cacheHandler, 'get', (originalGet: UseCacheHandler['get']) => {
    return function (this: UseCacheHandler, cacheKey: string, softTags?: string[]): Promise<unknown> {
      return startCacheSpan(CACHE_GET, cacheKey, async span => {
        const entry = await originalGet.call(this, cacheKey, softTags);
        setEntryAttributes(span, entry);
        return entry;
      });
    };
  });

  fill(cacheHandler, 'set', (originalSet: UseCacheHandler['set']) => {
    return function (this: UseCacheHandler, cacheKey: string, pendingEntry: Promise<unknown>): Promise<void> {
      // The handler drains `pendingEntry` (the still-streaming entry) before storing, so this
      // span covers producing and storing the entry, not just the write.
      return startCacheSpan(CACHE_PUT, cacheKey, () => originalSet.call(this, cacheKey, pendingEntry));
    };
  });
}

function instrumentHandlersMap(handlersMap: Map<string, UseCacheHandler>): void {
  for (const handler of handlersMap.values()) {
    instrumentHandler(handler);
  }

  // Custom handlers can be registered later (`setCacheHandler`), so wrap new entries as they arrive.
  fill(handlersMap, 'set', (originalSet: Map<string, UseCacheHandler>['set']) => {
    return function (this: Map<string, UseCacheHandler>, kind: string, handler: UseCacheHandler) {
      instrumentHandler(handler);
      return originalSet.call(this, kind, handler);
    };
  });
}

/**
 * Calls `onValue` with the registry value now, or when Next.js assigns it. Both orderings occur:
 * `next start` creates the registries before `instrumentation.ts` loads, the dev server after.
 */
function instrumentWhenAssigned(symbol: symbol, onValue: (value: unknown) => void): void {
  const globalWithCacheHandlers = globalThis as GlobalWithCacheHandlers;

  const existingValue = (globalWithCacheHandlers as Record<symbol, unknown>)[symbol];
  if (existingValue !== undefined) {
    onValue(existingValue);
    return;
  }

  let storedValue: unknown;
  Object.defineProperty(globalWithCacheHandlers, symbol, {
    configurable: true,
    // Non-enumerable so the accessor stays out of copies/spreads of `globalThis` in apps that
    // never assign the registry.
    enumerable: false,
    get: () => storedValue,
    set: (value: unknown) => {
      storedValue = value;
      onValue(value);
    },
  });
}

/**
 * Wraps Next.js' `use cache` handlers with `cache.get`/`cache.put` spans, so cached function
 * reads and fills show up in traces with hit/miss information. The registry only exists with
 * `cacheComponents`/`useCache` enabled; otherwise this only installs inert interceptors.
 */
export function instrumentUseCacheHandlers(): void {
  try {
    const globalWithCacheHandlers = globalThis as GlobalWithCacheHandlers;

    if (globalWithCacheHandlers[SENTRY_CACHE_INSTRUMENTED]) {
      return;
    }
    globalWithCacheHandlers[SENTRY_CACHE_INSTRUMENTED] = true;

    instrumentWhenAssigned(NEXT_CACHE_HANDLERS_MAP, value => {
      if (value instanceof Map) {
        instrumentHandlersMap(value);
      }
    });

    // The dev server keeps `use cache: private` entries in a separate handler outside the map.
    instrumentWhenAssigned(NEXT_PRIVATE_CACHE_HANDLER, instrumentHandler);
  } catch (error) {
    DEBUG_BUILD && debug.warn('Failed to instrument Next.js cache handlers', error);
  }
}
