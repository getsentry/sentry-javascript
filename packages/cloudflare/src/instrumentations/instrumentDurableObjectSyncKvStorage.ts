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
              // keeping the value as close as possible to the Cloudflare Worker KV instrumentation
              // https://github.com/cloudflare/workerd/blob/6b8b11787e2b2a800ab0edd0690bfab3857b0529/src/workerd/api/sync-kv.c%2B%2B#L19
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
