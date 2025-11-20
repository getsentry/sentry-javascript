import {
  captureException,
  debug,
  flushIfServerless,
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  type SpanAttributes,
  startSpan,
  type StartSpanOptions,
} from '@sentry/core';
import { defineNitroPlugin, useStorage } from 'nitropack/runtime';
import type { CacheEntry, ResponseCacheEntry } from 'nitropack/types';
import type { Driver, Storage } from 'unstorage';
// @ts-expect-error - This is a virtual module
import { userStorageMounts } from '#sentry/storage-config.mjs';

type MaybeInstrumented<T> = T & {
  __sentry_instrumented__?: boolean;
};

type MaybeInstrumentedDriver = MaybeInstrumented<Driver>;

type DriverMethod = keyof Driver;

/**
 * Methods that should have a attribute to indicate a cache hit.
 */
const CACHE_HIT_METHODS = new Set<DriverMethod>(['hasItem', 'getItem', 'getItemRaw']);

/**
 * Creates a Nitro plugin that instruments the storage driver.
 */
export default defineNitroPlugin(async _nitroApp => {
  // This runs at runtime when the Nitro server starts
  const storage = useStorage();
  // Mounts are suffixed with a colon, so we need to add it to the set items
  const userMounts = new Set((userStorageMounts as string[]).map(m => `${m}:`));

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
});

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

      return startSpan(options, async span => {
        try {
          const result = await target.apply(thisArg, args);
          span.setStatus({ code: SPAN_STATUS_OK });

          if (CACHE_HIT_METHODS.has(methodName)) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, isCacheHit(args[0], result));
          }

          return result;
        } catch (error) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          captureException(error, {
            mechanism: {
              handled: false,
              type: options.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
            },
          });

          // Re-throw the error to be handled by the caller
          throw error;
        } finally {
          await flushIfServerless();
        }
      });
    },
  });
}

/**
 * Wraps the storage mount method to instrument the driver.
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
 * Normalizes the method name to snake_case to be used in span names or op.
 */
function normalizeMethodName(methodName: string): string {
  return methodName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Checks if the value is empty, used for cache hit detection.
 */
function isEmptyValue(value: unknown): value is null | undefined {
  return value === null || value === undefined;
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

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `cache.${normalizeMethodName(methodName)}`,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
    [SEMANTIC_ATTRIBUTE_CACHE_KEY]: keys.length > 1 ? keys : keys[0],
    'db.operation.name': methodName,
    'db.collection.name': mountBase.replace(/:$/, ''),
    'db.system.name': driver.name ?? 'unknown',
  };

  return {
    name: keys.join(', '),
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
  if (typeof key === 'object' && key !== null && 'key' in key) {
    return `${prefix}${key.key}`;
  }

  return `${prefix}${isEmptyValue(key) ? '' : String(key)}`;
}

const CACHED_FN_HANDLERS_RE = /^nitro:(functions|handlers):/i;

/**
 * Since Nitro's cache may not utilize the driver's TTL, it is possible that the value is present in the cache but won't be used by Nitro.
 * The maxAge and expires values are serialized by Nitro in the cache entry. This means the value presence does not necessarily mean a cache hit.
 * So in order to properly report cache hits for `defineCachedFunction` and `defineCachedEventHandler` we need to check the cached value ourselves.
 * First we check if the key matches the `defineCachedFunction` or `defineCachedEventHandler` key patterns, and if so we check the cached value.
 */
function isCacheHit(key: string, value: unknown): boolean {
  try {
    const isEmpty = isEmptyValue(value);
    // Empty value means no cache hit either way
    // Or if key doesn't match the cached function or handler patterns, we can return the empty value check
    if (isEmpty || !CACHED_FN_HANDLERS_RE.test(key)) {
      return !isEmpty;
    }

    return validateCacheEntry(key, JSON.parse(String(value)) as CacheEntry);
  } catch (error) {
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
  if (isEmptyValue(entry.value)) {
    return false;
  }

  // Date.now is used by Nitro internally, so safe to use here.
  // https://github.com/nitrojs/nitro/blob/5508f71b77730e967fb131de817725f5aa7c4862/src/runtime/internal/cache.ts#L78
  if (Date.now() > (entry.expires || 0)) {
    return false;
  }

  /**
   * Pulled from Nitro's cache entry validation
   * https://github.com/nitrojs/nitro/blob/5508f71b77730e967fb131de817725f5aa7c4862/src/runtime/internal/cache.ts#L223-L241
   */
  if (isResponseCacheEntry(key, entry)) {
    if (entry.value.status >= 400) {
      return false;
    }

    if (entry.value.body === undefined) {
      return false;
    }

    if (entry.value.headers.etag === 'undefined' || entry.value.headers['last-modified'] === 'undefined') {
      return false;
    }
  }

  return true;
}

/**
 * Checks if the cache entry is a response cache entry.
 */
function isResponseCacheEntry(key: string, _: CacheEntry): _ is CacheEntry<ResponseCacheEntry & { status: number }> {
  return key.startsWith('nitro:handlers:');
}
