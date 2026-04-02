import type { DurableObjectNamespace, DurableObjectStub } from '@cloudflare/workers-types';
import { instrumentFetcher } from './worker/instrumentFetcher';

/**
 * Instruments a DurableObjectNamespace binding to create spans for DO interactions.
 *
 * Wraps:
 * - `namespace.get(id)` / `namespace.getByName(name)` with a span + instruments returned stub
 * - `namespace.idFromName(name)` / `namespace.idFromString(id)` / `namespace.newUniqueId()` with breadcrumbs
 */
export function instrumentDurableObjectNamespace(namespace: DurableObjectNamespace): DurableObjectNamespace {
  return new Proxy(namespace, {
    get(target, prop, _receiver) {
      const value = Reflect.get(target, prop) as unknown;

      if (typeof value !== 'function') {
        return value;
      }

      if (prop === 'get' || prop === 'getByName') {
        return function (this: unknown, ...args: unknown[]) {
          const stub = Reflect.apply(value, target, args);

          return instrumentDurableObjectStub(stub);
        };
      }

      return value.bind(target);
    },
  });
}

/**
 * Instruments a DurableObjectStub to create spans for outgoing fetch calls.
 */
function instrumentDurableObjectStub(stub: DurableObjectStub): DurableObjectStub {
  return new Proxy(stub, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'fetch' && typeof value === 'function') {
        return instrumentFetcher((input, init) => Reflect.apply(value, target, [input, init]));
      }

      return value;
    },
  });
}
