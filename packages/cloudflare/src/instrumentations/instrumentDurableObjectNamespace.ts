import type { DurableObjectNamespace, DurableObjectStub } from '@cloudflare/workers-types';
import { appendRpcMeta } from '../utils/rpcMeta';
import { instrumentFetcher } from './worker/instrumentFetcher';

// Built-in DurableObjectStub methods that are not RPC calls.
export const STUB_NON_RPC_METHODS = new Set(['fetch', 'connect', 'dup']);

/**
 * Instruments a DurableObjectNamespace binding to create spans for DO interactions.
 *
 * Wraps:
 * - `namespace.get(id)` / `namespace.getByName(name)` with a span + instruments returned stub
 * - `namespace.idFromName(name)` / `namespace.idFromString(id)` / `namespace.newUniqueId()` with breadcrumbs
 *
 * @param namespace - The DurableObjectNamespace to instrument
 * @param propagateRpcTrace - Whether RPC method calls on the returned stubs carry trace context
 */
export function instrumentDurableObjectNamespace(
  namespace: DurableObjectNamespace,
  propagateRpcTrace = false,
): DurableObjectNamespace {
  return new Proxy(namespace, {
    get(target, prop, _receiver) {
      const value = Reflect.get(target, prop) as unknown;

      if (typeof value !== 'function') {
        return value;
      }

      if (prop === 'get' || prop === 'getByName') {
        return function (this: unknown, ...args: unknown[]) {
          const stub = Reflect.apply(value, target, args);

          return instrumentDurableObjectStub(stub, propagateRpcTrace);
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
 * @param propagateRpcTrace - Whether RPC method calls carry trace context
 */
function instrumentDurableObjectStub(stub: DurableObjectStub, propagateRpcTrace: boolean): DurableObjectStub {
  return new Proxy(stub, {
    get(target, prop) {
      const value = Reflect.get(target, prop);

      if (prop === 'fetch' && typeof value === 'function') {
        return instrumentFetcher((...args) => Reflect.apply(value, target, args));
      }

      if (
        propagateRpcTrace &&
        typeof value === 'function' &&
        typeof prop === 'string' &&
        !STUB_NON_RPC_METHODS.has(prop)
      ) {
        return (...args: unknown[]) => Reflect.apply(value, target, appendRpcMeta(args));
      }

      return value;
    },
  });
}
