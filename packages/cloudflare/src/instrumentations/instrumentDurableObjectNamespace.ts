import type { DurableObjectNamespace, DurableObjectStub } from '@cloudflare/workers-types';
import { appendRpcMeta } from '../utils/rpcMeta';
import { instrumentFetcher } from './worker/instrumentFetcher';
import { STUB_NON_RPC_METHODS } from './worker/instrumentEnv';

/**
 * Instruments a DurableObjectNamespace binding to create spans for DO interactions.
 *
 * Wraps:
 * - `namespace.get(id)` / `namespace.getByName(name)` with a span + instruments returned stub
 * - `namespace.idFromName(name)` / `namespace.idFromString(id)` / `namespace.newUniqueId()` with breadcrumbs
 *
 * @param namespace - The DurableObjectNamespace to instrument
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
 * Instruments a DurableObjectStub to create spans for outgoing fetch calls
 * and propagate trace context across RPC calls.
 *
 * @param stub - The DurableObjectStub to instrument
 */
function instrumentDurableObjectStub(stub: DurableObjectStub): DurableObjectStub {
  return new Proxy(stub, {
    get(target, prop) {
      const value = Reflect.get(target, prop);

      if (prop === 'fetch' && typeof value === 'function') {
        return instrumentFetcher((...args) => Reflect.apply(value, target, args));
      }

      if (typeof value === 'function' && typeof prop === 'string' && !STUB_NON_RPC_METHODS.has(prop)) {
        return (...args: unknown[]) => Reflect.apply(value, target, appendRpcMeta(args));
      }

      return value;
    },
  });
}
