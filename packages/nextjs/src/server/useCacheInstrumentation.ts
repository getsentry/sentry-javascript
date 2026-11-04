import { createHash } from 'node:crypto';
import { TraceFlags } from '@opentelemetry/api';
import {
  CACHE_HIT,
  CACHE_ITEM_AGE,
  CACHE_KEY,
  CACHE_OPERATION,
  CACHE_TAGS,
  CACHE_TTL,
  CODE_FILE_PATH,
  SENTRY_LINK_TYPE,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT } from '@sentry/conventions/op';
import type { Span, SpanContextData } from '@sentry/core';
import {
  CACHE_OPERATION_NAMES,
  debug,
  defineIntegration,
  extractTraceparentData,
  fill,
  getActiveSpan,
  getClient,
  hasSpanStreamingEnabled,
  hasSpansEnabled,
  LRUMap,
  spanIsSampled,
  spanToTraceHeader,
  startSpan,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';
import { getCacheFunctionSourceFile } from './useCacheSourceFile';

// Next.js shares its `use cache` handlers across bundles via `globalThis`
// (`next/src/server/use-cache/handlers.ts`). This module can load once per bundle, so all
// double-wrap guards must also live on `globalThis`.
const NEXT_CACHE_HANDLERS_MAP = Symbol.for('@next/cache-handlers-map');
const NEXT_PRIVATE_CACHE_HANDLER = Symbol.for('@next/cache-handlers-private');
const SENTRY_CACHE_INSTRUMENTED = Symbol.for('sentry.nextjs.cacheHandlersInstrumented');
const SENTRY_WRAPPED_HANDLERS = Symbol.for('sentry.nextjs.wrappedCacheHandlers');
const SENTRY_CACHE_ORIGINS = Symbol.for('sentry.nextjs.cacheOrigins');

const INTEGRATION_NAME = 'NextjsUseCache';
const CACHE_SPAN_ORIGIN = 'auto.cache.nextjs';
const CACHE_ORIGIN_LINK_TYPE = 'cache_origin';

// Hard memory bound for remembered fill origins: 2000 entries of a 12-char digest plus one span
// context stay well under 1 MB.
const CACHE_ORIGINS_MAX_SIZE = 2_000;

// Next.js' `INFINITE_CACHE` sentinel. An `expire` at or above it means "never expires", which carries no signal as a TTL attribute.
// https://github.com/vercel/next.js/blob/ed1aab5d386d07ee2f553107dd39995251a6e44e/packages/next/src/lib/constants.ts#L43-L46
const NEXT_INFINITE_CACHE = 0xfffffffe;

// Next.js' `MIN_PRERENDERABLE_EXPIRE` (seconds). The dev server keeps entries at least this long,
// even when their `expire` is shorter.
const NEXT_DEV_MIN_EXPIRE = 300;

// Next.js vendored types below: https://github.com/vercel/next.js/blob/ed1aab5d386d07ee2f553107dd39995251a6e44e/packages/next/src/server/lib/cache-handlers/types.ts

// Subset of Next.js' `CacheHandler`
interface UseCacheHandler {
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
  tags?: unknown[];
  /**
   * Set by Sentry, not by Next.js. Holds the `sentry-trace` header of the fill's `cache.put` span.
   * Handlers that keep unknown entry properties carry it to hits on other instances.
   */
  __sentryCacheOrigin?: unknown;
}

type GlobalWithCacheHandlers = typeof globalThis & {
  [NEXT_CACHE_HANDLERS_MAP]?: Map<string, UseCacheHandler>;
  [NEXT_PRIVATE_CACHE_HANDLER]?: UseCacheHandler;
  [SENTRY_CACHE_INSTRUMENTED]?: boolean;
  [SENTRY_WRAPPED_HANDLERS]?: WeakSet<object>;
  [SENTRY_CACHE_ORIGINS]?: LRUMap<string, CacheOrigin>;
};

interface CacheOrigin {
  context: SpanContextData;
  /** The fill's `CacheEntry.timestamp`. Identifies the entry revision this origin wrote. */
  entryTimestamp: number;
}

/**
 * Cache keys are long serialized payloads (function id + arguments), so spans carry a digest
 * instead. This bounds span size, avoids leaking user data, and still groups identical keys.
 */
function keyDigest(cacheKey: string): string {
  return createHash('sha1').update(cacheKey).digest('hex').slice(0, 12);
}

/**
 * Cache reads can be hot, so all span work (including key hashing) is skipped without a sampled
 * parent span. Background revalidations still pass: they parent to the serving request's
 * (possibly already finished) root span.
 */
function shouldRecordCacheSpan(): boolean {
  const activeSpan = getActiveSpan();
  return !!activeSpan && spanIsSampled(activeSpan);
}

function startCacheSpan<T>(
  op: typeof CACHE_GET | typeof CACHE_PUT,
  digest: string,
  extraAttributes: Record<string, string>,
  callback: (span: Span) => T,
): T {
  const client = getClient();

  return startSpan(
    {
      // low cardinality name for span streaming, so we can't fall back to the cache key
      name: client && hasSpanStreamingEnabled(client) ? op : digest,
      op,
      attributes: {
        [SENTRY_ORIGIN]: CACHE_SPAN_ORIGIN,
        [CACHE_KEY]: [digest],
        [CACHE_OPERATION]: CACHE_OPERATION_NAMES[op],
        ...extraAttributes,
      },
    },
    callback,
  );
}

/**
 * Safety net for custom handlers that return entries past `expire`: Next.js discards those and
 * re-runs the function. Its default handler already returns no entry in that case.
 */
function isExpired(ageMs: number | undefined, expire: number | undefined): boolean {
  if (ageMs === undefined || typeof expire !== 'number') {
    return false;
  }
  const effectiveExpire = process.env.NODE_ENV === 'development' ? Math.max(expire, NEXT_DEV_MIN_EXPIRE) : expire;
  return ageMs > effectiveExpire * 1000;
}

/**
 * A missing entry is a miss. Next.js' default handler also returns no entry for expired, evicted,
 * or tag-invalidated entries, so those count as misses too. Returns whether the read was a hit.
 */
function recordCacheEntry(span: Span, entry: unknown): boolean {
  if (entry === undefined) {
    span.setAttribute(CACHE_HIT, false);
    return false;
  }

  const { timestamp, expire, tags } = (entry ?? {}) as UseCacheEntry;
  const ageMs = typeof timestamp === 'number' ? timestampInSeconds() * 1000 - timestamp : undefined;

  const hit = !isExpired(ageMs, expire);
  span.setAttribute(CACHE_HIT, hit);

  if (ageMs !== undefined) {
    // Clamped: with a remote handler, the filling and the reading machine's clocks can drift.
    span.setAttribute(CACHE_ITEM_AGE, Math.max(0, Math.round(ageMs / 1000)));
  }
  // A negative `expire` is Next.js' eviction sentinel, not a TTL.
  if (typeof expire === 'number' && expire >= 0 && expire < NEXT_INFINITE_CACHE) {
    span.setAttribute(CACHE_TTL, expire);
  }
  const stringTags = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
  if (stringTags.length > 0) {
    span.setAttribute(CACHE_TAGS, stringTags);
  }
  return hit;
}

// Fallback for handlers that drop unknown entry properties. Only a hit on the instance that did the
// fill can use it. Lives on `globalThis`, like the rest of the instrumentation state.
function getCacheOrigins(): LRUMap<string, CacheOrigin> {
  const globalWithCacheHandlers = globalThis as GlobalWithCacheHandlers;
  if (!globalWithCacheHandlers[SENTRY_CACHE_ORIGINS]) {
    globalWithCacheHandlers[SENTRY_CACHE_ORIGINS] = new LRUMap(CACHE_ORIGINS_MAX_SIZE);
  }
  return globalWithCacheHandlers[SENTRY_CACHE_ORIGINS];
}

/**
 * Links a cache hit to the fill that wrote this entry revision. A hit whose origin is unknown gets
 * no link, never a stale one.
 */
function linkCacheOrigin(span: Span, originKey: string, entry: unknown): void {
  const context = getPatchedCacheOrigin(entry) ?? getRememberedCacheOrigin(originKey, entry);
  if (context) {
    span.addLink({ context, attributes: { [SENTRY_LINK_TYPE]: CACHE_ORIGIN_LINK_TYPE } });
  }
}

/**
 * Next.js writes an entry only after it runs the cached function, and it never writes back a hit.
 * So a patched origin always belongs to the entry revision that carries it. Links point only at
 * sampled traces.
 */
function getPatchedCacheOrigin(entry: unknown): SpanContextData | undefined {
  const { __sentryCacheOrigin } = (entry ?? {}) as UseCacheEntry;
  const origin = typeof __sentryCacheOrigin === 'string' ? extractTraceparentData(__sentryCacheOrigin) : undefined;
  return origin?.traceId && origin.parentSpanId && origin.parentSampled
    ? { traceId: origin.traceId, spanId: origin.parentSpanId, traceFlags: TraceFlags.SAMPLED }
    : undefined;
}

/** The table can outlive the entry revision it remembers, so the fill timestamp must match. */
function getRememberedCacheOrigin(originKey: string, entry: unknown): SpanContextData | undefined {
  const origin = getCacheOrigins().get(originKey);
  const { timestamp } = (entry ?? {}) as UseCacheEntry;
  return origin && origin.entryTimestamp === timestamp ? origin.context : undefined;
}

/**
 * Handlers get the patched promise, not the original one. Some handlers copy the entry in their own
 * `then`, which can run before a callback that is added later.
 */
function patchCacheOrigin(pendingEntry: Promise<unknown>, origin: string): Promise<unknown> {
  const patchedEntry = Promise.resolve(pendingEntry).then(entry => {
    if (typeof entry === 'object' && entry !== null) {
      try {
        // Patch in place, not on a copy. Handlers can replace `entry.value` on the object they get,
        // and Next.js keeps a reference to that object.
        (entry as UseCacheEntry).__sentryCacheOrigin = origin;
      } catch (error) {
        // Frozen or proxied entries reject new properties. Hits then fall back to the table.
        DEBUG_BUILD && debug.warn('Failed to patch a Next.js cache fill origin', error);
      }
    }
    return entry;
  });
  // A handler can fail the write without reading the entry. A failed entry then has no other
  // rejection handler, and Sentry must not cause an unhandled rejection.
  patchedEntry.catch(() => undefined);
  return patchedEntry;
}

/**
 * Remembers the `cache.put` span as the origin of the entry revision it wrote. The handler drains
 * `pendingEntry` before the write resolves, so the read here resolves immediately.
 * An entry without a numeric `timestamp` has no revision identity and is not remembered.
 */
function rememberCacheOrigin(originKey: string, span: Span, pendingEntry: Promise<unknown>): void {
  Promise.resolve(pendingEntry).then(
    entry => {
      try {
        const { timestamp } = (entry ?? {}) as UseCacheEntry;
        if (typeof timestamp === 'number') {
          getCacheOrigins().set(originKey, { context: span.spanContext(), entryTimestamp: timestamp });
        }
      } catch (error) {
        DEBUG_BUILD && debug.warn('Failed to remember a Next.js cache fill origin', error);
      }
    },
    () => {
      // A rejected entry was never stored, so there is nothing to remember.
    },
  );
}

function isCacheHandler(value: unknown): value is UseCacheHandler {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UseCacheHandler).get === 'function' &&
    typeof (value as UseCacheHandler).set === 'function'
  );
}

// A WeakSet instead of a marker property, because frozen or proxied handlers reject new properties.
function getWrappedHandlers(): WeakSet<object> {
  const globalWithCacheHandlers = globalThis as GlobalWithCacheHandlers;
  if (!globalWithCacheHandlers[SENTRY_WRAPPED_HANDLERS]) {
    globalWithCacheHandlers[SENTRY_WRAPPED_HANDLERS] = new WeakSet();
  }
  return globalWithCacheHandlers[SENTRY_WRAPPED_HANDLERS];
}

// One origin namespace per wrapped handler, so identical cache keys in different cache stores
// (default, remote, private) can never link across stores.
let wrappedHandlerCount = 0;

function instrumentHandler(handler: unknown): void {
  // Runs inside Next.js' handler registration, which must never fail because of Sentry.
  try {
    const wrappedHandlers = getWrappedHandlers();
    if (!isCacheHandler(handler) || wrappedHandlers.has(handler)) {
      return;
    }
    wrappedHandlers.add(handler);
    const originKeyPrefix = `${wrappedHandlerCount++}:`;

    fill(handler, 'get', (originalGet: UseCacheHandler['get']) => {
      return function (this: UseCacheHandler, cacheKey: string, softTags?: string[]): Promise<unknown> {
        if (!shouldRecordCacheSpan()) {
          return originalGet.call(this, cacheKey, softTags);
        }
        const digest = keyDigest(cacheKey);
        return startCacheSpan(CACHE_GET, digest, {}, span =>
          // `Promise.resolve` because custom handlers may return the entry synchronously.
          Promise.resolve(originalGet.call(this, cacheKey, softTags)).then(entry => {
            try {
              if (recordCacheEntry(span, entry)) {
                linkCacheOrigin(span, originKeyPrefix + digest, entry);
              }
            } catch (error) {
              DEBUG_BUILD && debug.warn('Failed to read Next.js cache entry metadata', error);
            }
            return entry;
          }),
        );
      };
    });

    fill(handler, 'set', (originalSet: UseCacheHandler['set']) => {
      return function (this: UseCacheHandler, cacheKey: string, pendingEntry: Promise<unknown>): Promise<void> {
        if (!shouldRecordCacheSpan()) {
          return originalSet.call(this, cacheKey, pendingEntry);
        }

        const digest = keyDigest(cacheKey);
        const sourceFile = getCacheFunctionSourceFile(cacheKey);

        // The handler drains `pendingEntry` (the still-streaming entry) before storing, so this
        // span covers producing and storing the entry, not just the write.
        return startCacheSpan(CACHE_PUT, digest, sourceFile ? { [CODE_FILE_PATH]: sourceFile } : {}, span => {
          // Read `isRecording()` before the write. The span ends with the write, and a handler can
          // resolve the write before it reads the entry. A span dropped by `ignoreSpans` never reaches Sentry, so
          // a link to it would be broken.
          if (!span.isRecording()) {
            return originalSet.call(this, cacheKey, pendingEntry);
          }
          const patchedEntry = patchCacheOrigin(pendingEntry, spanToTraceHeader(span));
          return Promise.resolve(originalSet.call(this, cacheKey, patchedEntry)).then(result => {
            // Only a successful write becomes a fill origin. A failed write leaves no entry or the
            // previous one, whose origin still applies.
            rememberCacheOrigin(originKeyPrefix + digest, span, patchedEntry);
            return result;
          });
        });
      };
    });
  } catch (error) {
    DEBUG_BUILD && debug.warn('Failed to instrument a Next.js cache handler', error);
  }
}

function instrumentHandlersMap(handlersMap: Map<string, UseCacheHandler>): void {
  for (const handler of handlersMap.values()) {
    instrumentHandler(handler);
  }

  // Custom handlers can be registered later (`setCacheHandler`), so wrap new entries as they arrive.
  fill(handlersMap, 'set', (originalSet: Map<string, UseCacheHandler>['set']) => {
    return function (this: Map<string, UseCacheHandler>, kind: string, handler: UseCacheHandler) {
      const result = originalSet.call(this, kind, handler);
      instrumentHandler(handler);
      return result;
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

/** Installs the `use cache` handler instrumentation once per process.
 *
 *  Only exported for testing.
 *
 *  @internal
 */
export function _instrumentUseCacheHandlers(): void {
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

/**
 * Wraps Next.js' `use cache` handlers with `cache.get`/`cache.put` spans, so cached function
 * reads and fills show up in traces with hit/miss information.
 * A hit also adds a `cache_origin` span link to the `cache.put` span of the trace that filled the entry.
 */
export const nextjsUseCacheIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // The resolved client options also cover tracing enabled via `SENTRY_TRACES_SAMPLE_RATE`.
      if (hasSpansEnabled(client.getOptions())) {
        _instrumentUseCacheHandlers();
      }
    },
  };
});
