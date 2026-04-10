import { isDurableObjectNamespace, isJSRPC } from '../../utils/isBinding';
import { instrumentDurableObjectNamespace } from '../instrumentDurableObjectNamespace';
import { instrumentFetcher } from './instrumentFetcher';

function isProxyable(item: unknown): item is object {
  return item !== null && (typeof item === 'object' || typeof item === 'function');
}

const instrumentedBindings = new WeakMap<object, unknown>();

/**
 * Wraps the Cloudflare `env` object in a Proxy that detects binding types
 * on property access and returns instrumented versions.
 *
 * Currently detects:
 * - DurableObjectNamespace (via `idFromName` duck-typing)
 * - Service bindings / JSRPC proxies (wraps `fetch` for trace propagation)
 *
 * Extensible for future binding types (KV, D1, Queue, etc.).
 */
export function instrumentEnv<Env extends Record<string, unknown>>(env: Env): Env {
  if (!env || typeof env !== 'object') {
    return env;
  }

  return new Proxy(env, {
    get(target, prop, receiver) {
      const item = Reflect.get(target, prop, receiver);

      if (!isProxyable(item)) {
        return item;
      }

      const cached = instrumentedBindings.get(item);

      if (cached) {
        return cached;
      }

      if (isDurableObjectNamespace(item)) {
        const instrumented = instrumentDurableObjectNamespace(item);
        instrumentedBindings.set(item, instrumented);
        return instrumented;
      }

      if (isJSRPC(item)) {
        const instrumented = new Proxy(item, {
          get(target, p, rcv) {
            const value = Reflect.get(target, p, rcv);

            if (p === 'fetch' && typeof value === 'function') {
              return instrumentFetcher(value.bind(target));
            }

            return value;
          },
        });

        instrumentedBindings.set(item, instrumented);
        return instrumented;
      }

      return item;
    },
  });
}
