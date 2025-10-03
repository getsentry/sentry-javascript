import {
  type SpanAttributes,
  captureException,
  debug,
  flushIfServerless,
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpan,
} from '@sentry/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { defineNitroPlugin, useStorage } from 'nitropack/runtime';
import type { Driver, Storage } from 'unstorage';
// @ts-expect-error - This is a virtual module
import { userStorageMounts } from '#sentry/storage-config.mjs';

type MaybeInstrumentedDriver = Driver & {
  __sentry_instrumented__?: boolean;
};

/**
 * Methods that should have a key argument.
 */
const KEYED_METHODS = new Set([
  'hasItem',
  'getItem',
  'getItemRaw',
  'getItems',
  'setItem',
  'setItemRaw',
  'setItems',
  'removeItem',
]);

/**
 * Methods that should have a attribute to indicate a cache hit.
 */
const CACHE_HIT_METHODS = new Set(['hasItem', 'getItem', 'getKeys']);

/**
 * Creates a Nitro plugin that instruments the storage driver.
 */
export default defineNitroPlugin(async _nitroApp => {
  // This runs at runtime when the Nitro server starts
  const storage = useStorage();
  // Mounts are suffixed with a colon, so we need to add it to the set items
  const userMounts = new Set((userStorageMounts as string[]).map(m => `${m}:`));

  debug.log('[storage] Starting to instrument storage drivers...');

  // Get all mounted storage drivers
  const mounts = storage.getMounts();
  for (const mount of mounts) {
    // Skip excluded mounts and root mount
    if (!userMounts.has(mount.base)) {
      continue;
    }

    try {
      instrumentDriver(mount.driver, mount.base);
    } catch {
      debug.error(`[storage] Failed to unmount mount: "${mount.base}"`);
    }

    // Wrap the mount method to instrument future mounts
    storage.mount = wrapStorageMount(storage);
  }
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
  const methodsToInstrument: (keyof Driver)[] = [
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
  methodName: string,
  driver: Driver,
  mountBase: string,
): (...args: unknown[]) => unknown {
  return new Proxy(original, {
    async apply(target, thisArg, args) {
      const attributes = getSpanAttributes(methodName, driver, mountBase, args);

      debug.log(`[storage] Running method: "${methodName}" on driver: "${driver.name ?? 'unknown'}"`);

      const spanName = KEYED_METHODS.has(methodName)
        ? `${mountBase}${args?.[0]}`
        : `storage.${normalizeMethodName(methodName)}`;

      return startSpan(
        {
          name: spanName,
          attributes,
        },
        async span => {
          try {
            const result = await target.apply(thisArg, args);
            span.setStatus({ code: SPAN_STATUS_OK });

            if (CACHE_HIT_METHODS.has(methodName)) {
              span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, true);
            }

            return result;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
              },
            });

            // Re-throw the error to be handled by the caller
            throw error;
          } finally {
            await flushIfServerless();
          }
        },
      );
    },
  });
}

/**
 * Wraps the storage mount method to instrument the driver.
 */
function wrapStorageMount(storage: Storage): Storage['mount'] {
  const original = storage.mount;

  function mountWithInstrumentation(base: string, driver: Driver): Storage {
    debug.log(`[storage] Instrumenting mount: "${base}"`);

    const instrumentedDriver = instrumentDriver(driver, base);

    return original(base, instrumentedDriver);
  }

  return mountWithInstrumentation;
}

/**
 * Gets the span attributes for the storage method.
 */
function getSpanAttributes(methodName: string, driver: Driver, mountBase: string, args: unknown[]): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `cache.${normalizeMethodName(methodName)}`,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
    'nuxt.storage.op': methodName,
    'nuxt.storage.mount': mountBase,
    'nuxt.storage.driver': driver.name ?? 'unknown',
  };

  // Add the key if it's a get/set/del call
  if (args?.[0] && typeof args[0] === 'string') {
    attributes[SEMANTIC_ATTRIBUTE_CACHE_KEY] = `${mountBase}${args[0]}`;
  }

  return attributes;
}

/**
 * Normalizes the method name to snake_case to be used in span names or op.
 */
function normalizeMethodName(methodName: string): string {
  return methodName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
