import type { CloudflareOptions } from '../../client';
import { isDurableObjectNamespace, isJSRPC, isQueue } from '../../utils/isBinding';
import { getEffectiveRpcPropagation } from '../../utils/rpcOptions';
import { instrumentDurableObjectNamespace } from '../instrumentDurableObjectNamespace';
import { instrumentFetcher } from './instrumentFetcher';
import { instrumentQueueProducer } from './instrumentQueueProducer';

function isProxyable(item: unknown): item is object {
  return item !== null && (typeof item === 'object' || typeof item === 'function');
}

const instrumentedBindings = new WeakMap<object, unknown>();

/**
 * Wraps the Cloudflare `env` object in a Proxy that detects binding types
 * on property access and returns instrumented versions.
 *
 * Currently detects:
 * - DurableObjectNamespace (via `idFromName` duck-typing) — RPC trace propagation
 * - Service bindings / JSRPC proxies — RPC trace propagation on `fetch`
 * - Queue producers (via `send` + `sendBatch` duck-typing) — `queue.publish` spans
 *
 * Extensible for future binding types (KV, D1, etc.).
 *
 * @param env - The Cloudflare env object to instrument
 * @param options - Optional CloudflareOptions to control RPC trace propagation
 */
export function instrumentEnv<Env extends Record<string, unknown>>(env: Env, options?: CloudflareOptions): Env {
  if (!env || typeof env !== 'object') {
    return env;
  }

  const rpcPropagation = options ? getEffectiveRpcPropagation(options) : false;

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

      if (isQueue(item)) {
        const bindingName = typeof prop === 'string' ? prop : String(prop);
        const instrumented = instrumentQueueProducer(item, bindingName);
        instrumentedBindings.set(item, instrumented);
        return instrumented;
      }

      // RPC-propagating bindings are gated behind enableRpcTracePropagation
      if (!rpcPropagation) {
        return item;
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
