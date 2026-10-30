import {
  CACHE_HIT,
  CACHE_KEY,
  CACHE_OPERATION,
  SENTRY_OP,
  SENTRY_ORIGIN,
  DB_COLLECTION_NAME,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import {
  CACHE_OPERATION_NAMES,
  captureException,
  debug,
  getClient,
  hasSpanStreamingEnabled,
  isObjectLike,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  type SpanAttributes,
  startSpan,
  type StartSpanOptions,
} from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import type { Driver, Storage } from 'unstorage';

/**
 * A minimal cache entry type compatible with both nitropack (Nitro v2) and nitro (Nitro v3+).
 * Mirrors the shape of `CacheEntry` from both packages.
 */
interface CacheEntry<T = unknown> {
  value?: T;
  expires?: number;
  stale?: boolean;
}

/**
 * A minimal response cache entry type compatible with both nitropack (Nitro v2) and nitro (Nitro v3+).
 * Mirrors the shape of `ResponseCacheEntry` from both packages.
 */
interface ResponseCacheEntry {
  status?: number;
  body?: unknown;
  headers?: Record<string, string | undefined>;
}

/**
 * The Nitro-specific Storage interface that extends unstorage's Storage with `getMounts`.
 * Both nitropack and nitro expose a storage with this shape at runtime.
 */
interface NitroStorage extends Storage {
  getMounts(): Array<{ base: string; driver: Driver }>;
}

type MaybeInstrumented<T> = T & {
  __sentry_instrumented__?: boolean;
};

type MaybeInstrumentedDriver = MaybeInstrumented<Driver>;

type DriverMethod = keyof Driver;

/**
 * Methods that should have an attribute to indicate a cache hit.
 */
const CACHE_HIT_METHODS = new Set<DriverMethod>(['hasItem', 'getItem', 'getItemRaw', 'getItems']);

/**
 * Maps each unstorage method to a convention cache op. Reads (including existence and key
 * listing) are `cache.get`, writes are `cache.put`, and deletions are `cache.remove`.
 * The precise method stays available on `db.operation.name`.
 */
const METHOD_SPAN_OPS = {
  hasItem: CACHE_GET,
  getItem: CACHE_GET,
  getItemRaw: CACHE_GET,
  getItems: CACHE_GET,
  getKeys: CACHE_GET,
  setItem: CACHE_PUT,
  setItemRaw: CACHE_PUT,
  setItems: CACHE_PUT,
  removeItem: CACHE_REMOVE,
  clear: CACHE_REMOVE,
} as const satisfies Partial<Record<DriverMethod, string>>;

/**
 * Creates the Nitro storage plugin setup by instrumenting all relevant storage drivers.
 *
 * The `useStorage` parameter is typed as `() => unknown` because nitropack (Nitro v2) and nitro (Nitro v3+) define `StorageValue` differently.
 * Cast to `NitroStorage` is safe since all Nitro versions expose `getMounts()` at runtime.
 */
export function createStoragePlugin(useStorage: () => unknown, userStorageMounts: string[]): void {
  // This runs at runtime when the Nitro server starts
  const storage = useStorage() as NitroStorage;
  // Mounts are suffixed with a colon, so we need to add it to the set items
  const userMounts = new Set(userStorageMounts.map(m => `${m}:`));

  debug.log('[storage] Starting to instrument storage drivers...');

  // Adds cache mount to handle Nitro's cache calls
  // Nitro uses the mount to cache functions and event handlers
  // https://nitro.build/guide/cache
  userMounts.add('cache:');
  // In production, unless the user configured a specific cache driver, Nitro will use the memory driver at root mount.
  // Either way, we need to instrument the root mount as well.
  userMounts.add('');

  // Get all mounted storage drivers
  const mounts = storage.getMounts();
  for (const mount of mounts) {
    // Skip excluded mounts and root mount
    if (!userMounts.has(mount.base)) {
      continue;
    }

    instrumentDriver(mount.driver, mount.base);
  }

  // Wrap the mount method to instrument future mounts
  storage.mount = wrapStorageMount(storage);
}

/**
 * Instruments a driver by wrapping all method calls using proxies.
 */
function instrumentDriver(driver: MaybeInstrumentedDriver, mountBase: string): Driver {
  // Already instrumented, skip...
  if (driver.__sentry_instrumented__) {
    debug.log(`[storage] Driver already instrumented: "${driver.name}". Skipping...`);

    return driver;
  }

  debug.log(`[storage] Instrumenting driver: "${driver.name}" on mount: "${mountBase}"`);

  // List of driver methods to instrument
  // get/set/remove are aliases and already use their {method}Item methods
  const methodsToInstrument: DriverMethod[] = [
    'hasItem',
    'getItem',
    'getItemRaw',
    'getItems',
    'setItem',
    'setItemRaw',
    'setItems',
    'removeItem',
    'getKeys',
    'clear',
  ];

  for (const methodName of methodsToInstrument) {
    const original = driver[methodName];
    // Skip if method doesn't exist on this driver
    if (typeof original !== 'function') {
      continue;
    }

    // Replace with instrumented
    driver[methodName] = createMethodWrapper(original, methodName, driver, mountBase);
  }

  // Mark as instrumented
  driver.__sentry_instrumented__ = true;

  return driver;
}

/**
 * Creates an instrumented method for the given method.
 */
function createMethodWrapper(
  original: (...args: unknown[]) => unknown,
  methodName: DriverMethod,
  driver: Driver,
  mountBase: string,
): (...args: unknown[]) => unknown {
  return new Proxy(original, {
    async apply(target, thisArg, args) {
      const options = createSpanStartOptions(methodName, driver, mountBase, args);

      debug.log(`[storage] Running method: "${methodName}" on driver: "${driver.name ?? 'unknown'}"`);

      return traceCacheOperation(
        options,
        () => target.apply(thisArg, args),
        CACHE_HIT_METHODS.has(methodName) ? result => resolveCacheHit(methodName, args[0], result) : undefined,
      );
    },
  });
}

/**
 * Runs a cache operation in a span, optionally recording whether the result was a cache hit.
 */
function traceCacheOperation(
  options: StartSpanOptions,
  operation: () => unknown,
  getCacheHit?: (result: unknown) => boolean,
): Promise<unknown> {
  return startSpan(options, async span => {
    try {
      const result = await operation();
      span.setStatus({ code: SPAN_STATUS_OK });

      if (getCacheHit) {
        span.setAttribute(CACHE_HIT, getCacheHit(result));
      }

      return result;
    } catch (error) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      captureException(error, {
        mechanism: {
          handled: false,
          type: options.attributes?.[SENTRY_ORIGIN],
        },
      });

      // Re-throw the error to be handled by the caller
      throw error;
    } finally {
      await flushIfServerless();
    }
  });
}

/**
 * The storage behind Nitro v3's `defineCachedFunction` and `defineCachedHandler` (an `ocache` storage).
 */
interface NitroCacheStorage {
  get(key: string): unknown;
  set(key: string, value: unknown, opts?: { ttl?: number }): unknown;
}

/**
 * Instruments the storage that Nitro v3 caches functions and handlers in.
 *
 * Unlike Nitro v2, Nitro v3 only writes its cache to KV storage with the `kv` cache driver, so the KV
 * driver instrumentation doesn't see the default `memory` or the `fs` cache driver.
 * The storage is patched in place because `ocache` reads other properties, like `binary`, from it.
 */
export function instrumentCacheStorage<T extends NitroCacheStorage>(
  storage: MaybeInstrumented<T>,
  driverName: string,
): T {
  if (storage.__sentry_instrumented__) {
    return storage;
  }

  const originalGet = storage.get.bind(storage);
  const originalSet = storage.set.bind(storage);

  storage.get = (key: string) =>
    traceCacheOperation(
      createCacheStorageSpanStartOptions('get', CACHE_GET, key, driverName),
      () => originalGet(key),
      isCacheEntryHit,
    );

  storage.set = (key: string, value: unknown, opts?: { ttl?: number }) =>
    // `ocache` deletes an entry by setting it to `null`
    traceCacheOperation(
      createCacheStorageSpanStartOptions('set', value == null ? CACHE_REMOVE : CACHE_PUT, key, driverName),
      () => originalSet(key, value, opts),
    );

  storage.__sentry_instrumented__ = true;

  return storage;
}

function createCacheStorageSpanStartOptions(
  methodName: keyof NitroCacheStorage,
  cacheOperation: typeof CACHE_GET | typeof CACHE_PUT | typeof CACHE_REMOVE,
  key: string,
  driverName: string,
): StartSpanOptions {
  const client = getClient();
  return {
    // With span streaming, span names have to be low cardinality, so we can't fall back to the cache key.
    name: client && hasSpanStreamingEnabled(client) ? cacheOperation : key,
    attributes: {
      [SENTRY_OP]: cacheOperation,
      [CACHE_OPERATION]: CACHE_OPERATION_NAMES[cacheOperation],
      [SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [CACHE_KEY]: key,
      [DB_OPERATION_NAME]: methodName,
      [DB_SYSTEM_NAME]: driverName,
    },
  };
}

/**
 * `ocache` storage holds full cache entries, so a stored but expired or stale entry is a miss.
 */
function isCacheEntryHit(entry: unknown): boolean {
  return isObjectLike(entry) && !(entry as CacheEntry).stale && isFreshCacheEntry(entry);
}

/**
 * Wraps the storage mount method to instrument the driver on future mounts.
 */
function wrapStorageMount(storage: Storage): Storage['mount'] {
  const original: MaybeInstrumented<Storage['mount']> = storage.mount;
  if (original.__sentry_instrumented__) {
    return original;
  }

  function mountWithInstrumentation(base: string, driver: Driver): Storage {
    debug.log(`[storage] Instrumenting mount: "${base}"`);

    const instrumentedDriver = instrumentDriver(driver, base);

    return original(base, instrumentedDriver);
  }

  mountWithInstrumentation.__sentry_instrumented__ = true;

  return mountWithInstrumentation;
}

/**
 * Creates the span start options for the storage method.
 */
function createSpanStartOptions(
  methodName: keyof Driver,
  driver: Driver,
  mountBase: string,
  args: unknown[],
): StartSpanOptions {
  const keys = getCacheKeys(args?.[0], mountBase);
  const cacheOperation = METHOD_SPAN_OPS[methodName as keyof typeof METHOD_SPAN_OPS];
  const cacheOperationName = CACHE_OPERATION_NAMES[cacheOperation];

  const attributes: SpanAttributes = {
    [SENTRY_OP]: cacheOperation,
    [CACHE_OPERATION]: cacheOperationName,
    [SENTRY_ORIGIN]: 'auto.cache.nuxt',
    [CACHE_KEY]: keys.length > 1 ? keys : keys[0],
    [DB_OPERATION_NAME]: methodName,
    [DB_COLLECTION_NAME]: mountBase.replace(/:$/, ''),
    [DB_SYSTEM_NAME]: driver.name ?? 'unknown',
  };

  const client = getClient();
  return {
    // With span streaming, span names have to be low cardinality, so we can't fall back to the cache keys.
    name: client && hasSpanStreamingEnabled(client) ? cacheOperation : keys.join(', '),
    attributes,
  };
}

/**
 * Gets a normalized array of cache keys.
 */
function getCacheKeys(key: unknown, prefix: string): string[] {
  // Handles an array of keys
  if (Array.isArray(key)) {
    return key.map(k => normalizeKey(k, prefix));
  }

  return [normalizeKey(key, prefix)];
}

/**
 * Normalizes the key to a string for `cache.key` attribute.
 */
function normalizeKey(key: unknown, prefix: string): string {
  if (typeof key === 'string') {
    return `${prefix}${key}`;
  }

  // Handles an object with a key property
  if (isObjectLike(key) && 'key' in key) {
    return `${prefix}${key.key}`;
  }

  return `${prefix}${key == null ? '' : String(key)}`;
}

const CACHED_FN_HANDLERS_RE = /^nitro:(functions|handlers):/i;

/**
 * Resolves the `cache.hit` value for a read method. `hasItem` returns a boolean directly,
 * `getItems` returns a `{ key, value }[]` where a hit means at least one entry has a value,
 * and single-key reads fall back to the value-based `isCacheHit` check.
 */
function resolveCacheHit(methodName: DriverMethod, key: unknown, result: unknown): boolean {
  if (methodName === 'hasItem') {
    return Boolean(result);
  }

  if (methodName === 'getItems') {
    return Array.isArray(result) && result.some(item => isObjectLike(item) && item.value != null);
  }

  return isCacheHit(key, result);
}

/**
 * Since Nitro's cache may not utilize the driver's TTL, it is possible that the value is present in the cache but won't be used by Nitro.
 * The maxAge and expires values are serialized by Nitro in the cache entry. This means the value presence does not necessarily mean a cache hit.
 * So in order to properly report cache hits for `defineCachedFunction` and `defineCachedEventHandler` we need to check the cached value ourselves.
 * First we check if the key matches the `defineCachedFunction` or `defineCachedEventHandler` key patterns, and if so we check the cached value.
 */
function isCacheHit(key: unknown, value: unknown): boolean {
  try {
    const isEmpty = value == null;
    // Empty value means no cache hit either way
    // Or if key doesn't match the cached function or handler patterns, we can return the empty value check
    if (isEmpty || typeof key !== 'string' || !CACHED_FN_HANDLERS_RE.test(key)) {
      return !isEmpty;
    }

    return validateCacheEntry(key, JSON.parse(String(value)) as CacheEntry);
  } catch {
    // this is a best effort, so we return false if we can't validate the cache entry
    return false;
  }
}

/**
 * Validates the cache entry.
 */
function validateCacheEntry(
  key: string,
  entry: CacheEntry | CacheEntry<ResponseCacheEntry & { status: number }>,
): boolean {
  if (!isFreshCacheEntry(entry)) {
    return false;
  }

  /**
   * Pulled from Nitro's cache entry validation
   * https://github.com/nitrojs/nitro/blob/5508f71b77730e967fb131de817725f5aa7c4862/src/runtime/internal/cache.ts#L223-L241
   */
  if (isResponseCacheEntry(key, entry)) {
    if ((entry.value.status ?? 0) >= 400) {
      return false;
    }

    if (entry.value.body === undefined) {
      return false;
    }

    if (entry.value.headers?.etag === 'undefined' || entry.value.headers?.['last-modified'] === 'undefined') {
      return false;
    }
  }

  return true;
}

function isFreshCacheEntry<T>(entry: CacheEntry<T>): entry is CacheEntry<T> & { value: NonNullable<T> } {
  // Date.now is used by Nitro internally, so safe to use here.
  // https://github.com/nitrojs/nitro/blob/5508f71b77730e967fb131de817725f5aa7c4862/src/runtime/internal/cache.ts#L78
  return entry.value != null && Date.now() <= (entry.expires || 0);
}

/**
 * Checks if the cache entry is a response cache entry.
 */
function isResponseCacheEntry(key: string, _: CacheEntry): _ is CacheEntry<ResponseCacheEntry & { status: number }> {
  return key.startsWith('nitro:handlers:');
}
