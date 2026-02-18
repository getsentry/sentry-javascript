import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { storeSpanContext } from '../utils/traceLinks';

const STORAGE_METHODS_TO_INSTRUMENT = ['get', 'put', 'delete', 'list', 'setAlarm', 'getAlarm', 'deleteAlarm'] as const;

type StorageMethod = (typeof STORAGE_METHODS_TO_INSTRUMENT)[number];

/**
 * Instruments DurableObjectStorage methods with Sentry spans.
 *
 * Wraps the following async methods:
 * - get, put, delete, list (KV API)
 * - setAlarm, getAlarm, deleteAlarm (Alarm API)
 *
 * When setAlarm is called, it also stores the current span context so that when
 * the alarm fires later, it can link back to the trace that called setAlarm.
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
          async () => {
            const result = await (original as (...args: unknown[]) => Promise<unknown>).apply(target, args);
            // When setAlarm is called, store the current span context so that when the alarm
            // fires later, it can link back to the trace that called setAlarm.
            // We use the original (uninstrumented) storage (target) to avoid creating a span
            // for this internal operation.
            if (methodName === 'setAlarm') {
              await storeSpanContext(target, 'alarm');
            }
            return result;
          },
        );
      };
    },
  });
}
