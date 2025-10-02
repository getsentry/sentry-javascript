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
import type { Driver } from 'unstorage';

/**
 * Creates a Nitro plugin that instruments the storage driver.
 */
export default defineNitroPlugin(async _nitroApp => {
  // This runs at runtime when the Nitro server starts
  const storage = useStorage();

  // exclude mounts that are not relevant for instrumentation for a few reasons:
  // Nitro mounts some development-only mount points that are not relevant for instrumentation
  // https://nitro.build/guide/storage#development-only-mount-points
  const excludeMounts = new Set(['build:', 'cache:', 'root:', 'data:', 'src:', 'assets:']);

  debug.log('[Storage Instrumentation] Starting to instrument storage drivers...');

  // Get all mounted storage drivers
  const mounts = storage.getMounts();
  for (const mount of mounts) {
    // Skip excluded mounts and root mount
    if (!mount.base || excludeMounts.has(mount.base)) {
      continue;
    }

    debug.log(`[Storage Instrumentation] Instrumenting mount: "${mount.base}"`);

    const driver = instrumentDriver(mount.driver, mount.base);

    try {
      // Remount with instrumented driver
      await storage.unmount(mount.base);
      await storage.mount(mount.base, driver);
    } catch {
      debug.error(`[Storage Instrumentation] Failed to unmount mount: "${mount.base}"`);
    }
  }
});

/**
 * Instruments a driver by wrapping all method calls using proxies.
 */
function instrumentDriver(driver: Driver, mountBase: string): Driver {
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
