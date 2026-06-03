import type { SyncKvStorage } from '@cloudflare/workers-types';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

const SYNC_KV_METHODS_TO_INSTRUMENT = ['get', 'put', 'delete', 'list'] as const;

type SyncKvMethod = (typeof SYNC_KV_METHODS_TO_INSTRUMENT)[number];

export function instrumentDurableObjectSyncKvStorage(syncKv: SyncKvStorage): SyncKvStorage {
  return new Proxy(syncKv, {
    get(target, prop, _receiver) {
      const original = Reflect.get(target, prop, target);

      if (typeof original !== 'function') {
        return original;
      }

      const methodName = prop as SyncKvMethod;

      if (!SYNC_KV_METHODS_TO_INSTRUMENT.includes(methodName)) {
        return (original as (...args: unknown[]) => unknown).bind(target);
      }

      return function (this: unknown, ...args: unknown[]) {
        return startSpan(
          {
            name: `durable_object_storage_kv_${methodName}`,
            op: 'db',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
              'db.system.name': 'cloudflare-durable-object-sql',
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
