import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Checks if a value is a JSRPC proxy (service binding).
 *
 * JSRPC proxies return a truthy value for ANY property access, including
 * properties that don't exist. This makes other duck-type checks unreliable
 * unless we exclude JSRPC first.
 *
 * Must be checked before other binding type checks.
 * Kudos to https://github.com/evanderkoogh/otel-cf-workers/blob/effeb549f0a4ed1c55ea0c4f0d8e8e37e5494fb3/src/instrumentation/env.ts#L11
 */
export function isJSRPC(item: unknown): item is Service {
  try {
    return !!(item as Record<string, unknown>)[`__some_property_that_will_never_exist__${Math.random()}`];
  } catch {
    return false;
  }
}

const isNotJSRPC = (item: unknown): item is Record<string, unknown> => !isJSRPC(item);

/**
 * Duck-type check for DurableObjectNamespace bindings.
 * DurableObjectNamespace has `idFromName`, `idFromString`, `get`, `newUniqueId`.
 */
export function isDurableObjectNamespace(item: unknown): item is DurableObjectNamespace {
  return item != null && isNotJSRPC(item) && typeof item.idFromName === 'function';
}
