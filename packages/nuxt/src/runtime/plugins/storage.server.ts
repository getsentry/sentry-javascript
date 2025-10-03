import {
  type SpanAttributes,
  captureException,
  debug,
  flushIfServerless,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
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
 * Creates a Nitro plugin that instruments the storage driver.
 */
export default defineNitroPlugin(async _nitroApp => {
  // This runs at runtime when the Nitro server starts
  const storage = useStorage();
  // Mounts are suffixed with a colon, so we need to add it to the set items
  const userMounts = new Set((userStorageMounts as string[]).map(m => `${m}:`));

  debug.log('[Storage Instrumentation] Starting to instrument storage drivers...');

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
      debug.error(`[Storage Instrumentation] Failed to unmount mount: "${mount.base}"`);
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
    debug.log(`[Storage Instrumentation] Driver already instrumented: "${driver.name}". Skipping...`);

    return driver;
  }

  debug.log(`[Storage Instrumentation] Instrumenting driver: "${driver.name}" on mount: "${mountBase}"`);

  // List of driver methods to instrument
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
    'getMeta',
    'clear',
    'dispose',
  ];

  for (const methodName of methodsToInstrument) {
    const original = driver[methodName];
    // Skip if method doesn't exist on this driver
    if (typeof original !== 'function') {
      continue;
    }

    // Replace with instrumented
    driver[methodName] = createMethodWrapper(original, methodName, driver.name ?? 'unknown', mountBase);
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
  driverName: string,
  mountBase: string,
): (...args: unknown[]) => unknown {
  return new Proxy(original, {
    async apply(target, thisArg, args) {
      const attributes = getSpanAttributes(methodName, driverName ?? 'unknown', mountBase);

      debug.log(`[Storage Instrumentation] Running method: "${methodName}" on driver: "${driverName}"`);

      return startSpan(
        {
          name: `storage.${methodName}`,
          attributes,
        },
        async span => {
          try {
            const result = await target.apply(thisArg, args);
            span.setStatus({ code: SPAN_STATUS_OK });

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
    debug.log(`[Storage Instrumentation] Instrumenting mount: "${base}"`);

    const instrumentedDriver = instrumentDriver(driver, base);

    return original(base, instrumentedDriver);
  }

  return mountWithInstrumentation;
}

/**
 * Gets the span attributes for the storage method.
 */
function getSpanAttributes(methodName: string, driverName: string, mountBase: string): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'app.storage.nuxt',
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.app.storage.nuxt',
    'nuxt.storage.op': methodName,
    'nuxt.storage.driver': driverName,
    'nuxt.storage.mount': mountBase,
  };

  return attributes;
}
