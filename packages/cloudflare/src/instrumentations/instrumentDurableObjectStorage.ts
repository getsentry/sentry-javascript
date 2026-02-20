import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

const STORAGE_METHODS_TO_INSTRUMENT = ['get', 'put', 'delete', 'list'] as const;

type StorageMethod = (typeof STORAGE_METHODS_TO_INSTRUMENT)[number];

/**
 * Instruments DurableObjectStorage methods with Sentry spans.
 *
 * Wraps the following async methods:
 * - get, put, delete, list (KV API)
 *
 * @param storage - The DurableObjectStorage instance to instrument
 * @returns An instrumented DurableObjectStorage instance
 */
export function instrumentDurableObjectStorage(storage: DurableObjectStorage): DurableObjectStorage {
  return new Proxy(storage, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original !== 'function') {
        return original;
      }

      const methodName = prop as string;
      if (!STORAGE_METHODS_TO_INSTRUMENT.includes(methodName as StorageMethod)) {
        return (original as (...args: unknown[]) => unknown).bind(target);
      }

      return function (this: unknown, ...args: unknown[]) {
        return startSpan(
          {
            // Use underscore naming to match Cloudflare's native instrumentation (e.g., "durable_object_storage_get")
            name: `durable_object_storage_${methodName}`,
            op: 'db',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
              'db.system.name': 'cloudflare.durable_object.storage',
              'db.operation.name': methodName,
            },
          },
          () => {
            return (original as (...args: unknown[]) => unknown).apply(target, args);
          },
        );
      };
    },
  });
}
