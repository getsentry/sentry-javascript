import { isObjectLike } from '@sentry/core';
import { instrumentWorkersAiClient } from '@sentry/server-utils';
import type { CloudflareOptions } from '../../client';
import {
  isAiBinding,
  isD1Database,
  isDurableObjectNamespace,
  isJSRPC,
  isQueue,
  isR2Bucket,
  isRateLimit,
} from '../../utils/isBinding';
import { instrumentD1 } from './instrumentD1';
import { appendRpcMeta } from '../../utils/rpcMeta';
import { createRpcPropagationResolver } from '../../utils/rpcPropagation';
import { instrumentDurableObjectNamespace, STUB_NON_RPC_METHODS } from '../instrumentDurableObjectNamespace';
import { instrumentFetcher } from './instrumentFetcher';
import { instrumentQueueProducer } from './instrumentQueueProducer';
import { instrumentR2Bucket } from './instrumentR2';
import { instrumentRateLimit } from './instrumentRateLimit';

function isProxyable(item: unknown): item is object {
  return isObjectLike(item) || typeof item === 'function';
}

// Keyed by the raw binding first, then by the name it was reached through and the RPC propagation
// decision that name resolved to. Two names can alias the same binding object, and a name-scoped
// allowlist (or a name-scoped span attribute) makes their instrumented forms differ, so the binding
// object alone is not a sufficient cache key.
const instrumentedBindings = new WeakMap<object, Map<string, unknown>>();

function rememberBinding(item: object, cacheKey: string, instrumented: unknown): unknown {
  const byCacheKey = instrumentedBindings.get(item) ?? new Map<string, unknown>();
  byCacheKey.set(cacheKey, instrumented);
  instrumentedBindings.set(item, byCacheKey);

  return instrumented;
}

/**
 * Wraps the Cloudflare `env` object in a Proxy that detects binding types
 * on property access and returns instrumented versions.
 *
 * Currently detects:
 * - DurableObjectNamespace (via `idFromName` duck-typing)
 * - Service bindings / JSRPC proxies
 * - Queue producers (via `send` + `sendBatch` duck-typing)
 * - R2 Buckets (via `head` + `put` + `createMultipartUpload` duck-typing)
 * - Rate limiters (via `limit` duck-typing)
 * - Workers AI (via `run` + `gateway` + `toMarkdown` duck-typing)
 *
 * @param env - The Cloudflare env object to instrument
 * @param options - Optional CloudflareOptions to control RPC trace propagation
 */
export function instrumentEnv<Env extends Record<string, unknown>>(env: Env, options?: CloudflareOptions): Env {
  if (!env || typeof env !== 'object') {
    return env;
  }

  const shouldPropagateRpcTrace = createRpcPropagationResolver(options);

  return new Proxy(env, {
    get(target, prop, receiver) {
      const item = Reflect.get(target, prop, receiver);

      if (!isProxyable(item)) {
        return item;
      }

      const bindingName = typeof prop === 'string' ? prop : String(prop);
      const propagatesRpcTrace = shouldPropagateRpcTrace(bindingName);
      const cacheKey = `${propagatesRpcTrace ? '1' : '0'}:${bindingName}`;

      const cached = instrumentedBindings.get(item)?.get(cacheKey);

      if (cached) {
        return cached;
      }

      if (isD1Database(item)) {
        return rememberBinding(item, cacheKey, instrumentD1(item));
      }

      if (isQueue(item)) {
        return rememberBinding(item, cacheKey, instrumentQueueProducer(item, bindingName));
      }

      if (isR2Bucket(item)) {
        return rememberBinding(item, cacheKey, instrumentR2Bucket(item, bindingName));
      }

      if (isRateLimit(item)) {
        return rememberBinding(item, cacheKey, instrumentRateLimit(item, bindingName));
      }

      if (isAiBinding(item)) {
        return rememberBinding(item, cacheKey, instrumentWorkersAiClient(item));
      }

      // RPC trace propagation is opt-in, and the allowlist form scopes it to individual bindings —
      // a binding it does not cover is left exactly as the runtime handed it over.
      if (!propagatesRpcTrace) {
        return item;
      }

      if (isDurableObjectNamespace(item)) {
        return rememberBinding(item, cacheKey, instrumentDurableObjectNamespace(item));
      }

      if (isJSRPC(item)) {
        const instrumented = new Proxy(item, {
          get(target, p) {
            const value = Reflect.get(target, p);

            if (p === 'fetch' && typeof value === 'function') {
              return instrumentFetcher((...args) => Reflect.apply(value, target, args));
            }

            if (typeof value === 'function' && typeof p === 'string' && !STUB_NON_RPC_METHODS.has(p)) {
              return (...args: unknown[]) => Reflect.apply(value, target, appendRpcMeta(args));
            }

            return value;
          },
        });

        return rememberBinding(item, cacheKey, instrumented);
      }

      return item;
    },
  });
}
