import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { addBreadcrumb, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { storeSpanContext } from '../utils/traceLinks';

const STORAGE_METHODS_TO_INSTRUMENT = [
  'get',
  'put',
  'delete',
  'list',
  'getAlarm',
  'setAlarm',
  'deleteAlarm',
  'deleteAll',
  'sync',
  'transaction',
  'getCurrentBookmark',
  'getBookmarkForTime',
  'onNextSessionRestoreBookmark',
] as const;

type StorageMethod = (typeof STORAGE_METHODS_TO_INSTRUMENT)[number];

function getSpanName(methodName: StorageMethod, args: unknown[]): string {
  const baseSpanName = `durable_object.storage.${methodName}`;

  if (methodName === 'get' || methodName === 'delete') {
    const key = args[0];
    if (typeof key === 'string') {
      return `${baseSpanName} ${key}`;
    } else if (Array.isArray(key)) {
      return `${baseSpanName} (${key.length} keys)`;
    }
  } else if (methodName === 'put') {
    const firstArg = args[0];
    if (typeof firstArg === 'string') {
      return `${baseSpanName} ${firstArg}`;
    } else if (typeof firstArg === 'object' && firstArg !== null) {
      const keyCount = Object.keys(firstArg).length;
      return `${baseSpanName} (${keyCount} keys)`;
    }
  }

  return baseSpanName;
}

function getSpanAttributes(
  methodName: StorageMethod,
  args: unknown[],
): Record<string, string | number | undefined> {
  const attributes: Record<string, string | number | undefined> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
    'db.system': 'cloudflare.durable_object.storage',
    'db.operation.name': methodName,
  };

  if (methodName === 'get' || methodName === 'delete') {
    const key = args[0];
    if (typeof key === 'string') {
      attributes['db.cloudflare.durable_object.storage.key'] = key;
    } else if (Array.isArray(key)) {
      attributes['db.cloudflare.durable_object.storage.key_count'] = key.length;
    }
  } else if (methodName === 'put') {
    const firstArg = args[0];
    if (typeof firstArg === 'string') {
      attributes['db.cloudflare.durable_object.storage.key'] = firstArg;
    } else if (typeof firstArg === 'object' && firstArg !== null) {
      attributes['db.cloudflare.durable_object.storage.key_count'] = Object.keys(firstArg).length;
    }
  }

  return attributes;
}

function createBreadcrumb(methodName: StorageMethod, args: unknown[]): void {
  let message = `storage.${methodName}`;

  if (methodName === 'get' || methodName === 'delete') {
    const key = args[0];
    if (typeof key === 'string') {
      message = `storage.${methodName}("${key}")`;
    } else if (Array.isArray(key)) {
      message = `storage.${methodName}([${key.length} keys])`;
    }
  } else if (methodName === 'put') {
    const firstArg = args[0];
    if (typeof firstArg === 'string') {
      message = `storage.${methodName}("${firstArg}", ...)`;
    } else if (typeof firstArg === 'object' && firstArg !== null) {
      message = `storage.${methodName}({${Object.keys(firstArg).length} keys})`;
    }
  }

  addBreadcrumb({
    category: 'durable_object.storage',
    message,
    data: {
      method: methodName,
    },
  });
}

/**
 * Instruments DurableObjectStorage methods with Sentry spans and breadcrumbs.
 *
 * Wraps the following async methods:
 * - get, put, delete, list
 * - getAlarm, setAlarm, deleteAlarm
 * - deleteAll, sync, transaction
 * - getCurrentBookmark, getBookmarkForTime, onNextSessionRestoreBookmark
 *
 * Additionally, when `setAlarm` is called, it stores the current span context
 * so that the subsequent alarm execution can link back to the span that scheduled it.
 *
 * @param storage - The DurableObjectStorage instance to instrument
 * @returns An instrumented DurableObjectStorage instance
 */
export function instrumentDurableObjectStorage(storage: DurableObjectStorage): DurableObjectStorage {
  return new Proxy(storage, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // Only wrap methods we want to instrument
      if (typeof original !== 'function') {
        return original;
      }

      const methodName = prop as string;
      if (!STORAGE_METHODS_TO_INSTRUMENT.includes(methodName as StorageMethod)) {
        // For methods we don't instrument, just bind and return
        return (original as (...args: unknown[]) => unknown).bind(target);
      }

      // Return a wrapped function that creates a span
      return function (this: unknown, ...args: unknown[]) {
        const spanName = getSpanName(methodName as StorageMethod, args);
        const attributes = getSpanAttributes(methodName as StorageMethod, args);

        return startSpan(
          {
            name: spanName,
            op: 'db',
            attributes,
          },
          () => {
            const result = (original as (...args: unknown[]) => unknown).apply(target, args);

            // Add breadcrumb after operation completes (for promises, after resolution)
            if (result instanceof Promise) {
              return result.then(
                async res => {
                  createBreadcrumb(methodName as StorageMethod, args);
                  // When setAlarm is called, store the current span context so the alarm
                  // can link back to the span that scheduled it
                  if (methodName === 'setAlarm') {
                    await storeSpanContext(target, 'alarm');
                  }
                  return res;
                },
                err => {
                  createBreadcrumb(methodName as StorageMethod, args);
                  throw err;
                },
              );
            }

            createBreadcrumb(methodName as StorageMethod, args);
            return result;
          },
        );
      };
    },
  });
}
