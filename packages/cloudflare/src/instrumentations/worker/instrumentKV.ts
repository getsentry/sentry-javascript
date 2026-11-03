import type { KVNamespace } from '@cloudflare/workers-types';
import {
  CACHE_HIT,
  CACHE_KEY,
  CACHE_OPERATION,
  DB_COLLECTION_NAME,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import { CACHE_OPERATION_NAMES, isObjectLike, startSpan } from '@sentry/core';

const ORIGIN = 'auto.cache.cloudflare.kv';

type KVOperation = 'get' | 'getWithMetadata' | 'put' | 'delete' | 'list';

const OPERATION_SPAN_OPS = {
  get: CACHE_GET,
  getWithMetadata: CACHE_GET,
  put: CACHE_PUT,
  delete: CACHE_REMOVE,
  list: CACHE_GET,
} as const satisfies Record<KVOperation, string>;

function getCacheKeys(operation: KVOperation, args: unknown[]): string[] | undefined {
  if (operation === 'list') {
    return undefined;
  }

  const key = args[0];

  if (Array.isArray(key)) {
    return key.map(value => String(value));
  }

  return typeof key === 'string' ? [key] : key == null ? undefined : [String(key)];
}

function createSpanOptions(bindingName: string, operation: KVOperation, args: unknown[]) {
  const cacheOperation = OPERATION_SPAN_OPS[operation];
  const cacheOperationName = CACHE_OPERATION_NAMES[cacheOperation];
  const keys = getCacheKeys(operation, args);
  return {
    name: cacheOperation,
    onlyIfParent: true,
    attributes: {
      [SENTRY_OP]: cacheOperation,
      [CACHE_OPERATION]: cacheOperationName,
      [SENTRY_ORIGIN]: ORIGIN,
      ...(keys && keys.length > 0 && { [CACHE_KEY]: keys }),
      [DB_OPERATION_NAME]: operation,
      [DB_COLLECTION_NAME]: bindingName,
      [DB_SYSTEM_NAME]: 'cloudflare-kv',
    },
  };
}

function resolveCacheHit(operation: KVOperation, result: unknown): boolean {
  if (operation === 'list') {
    return false;
  }

  if (result instanceof Map) {
    return Array.from(result.values()).some(value => resolveCacheHit(operation, value));
  }

  if (operation === 'getWithMetadata' && isObjectLike(result) && 'value' in result) {
    return result.value != null;
  }

  return result != null;
}

/**
 * Wraps a Cloudflare Workers KV binding to create cache spans on namespace operations.
 *
 * Instrumented methods: get, getWithMetadata, put, delete, and list.
 */
export function instrumentKV<T extends KVNamespace>(kv: T, bindingName: string): T {
  return new Proxy(kv, {
    get(target, prop, receiver) {
      if (prop === 'get' || prop === 'getWithMetadata' || prop === 'put' || prop === 'delete' || prop === 'list') {
        const original = Reflect.get(target, prop, receiver);

        if (typeof original !== 'function') {
          return original;
        }

        return function (this: unknown, ...args: unknown[]) {
          const operation = prop;

          return startSpan(createSpanOptions(bindingName, operation, args), async span => {
            const result = await Reflect.apply(original, target, args);

            if (operation === 'get' || operation === 'getWithMetadata') {
              span.setAttribute(CACHE_HIT, resolveCacheHit(operation, result));
            }

            return result;
          });
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
