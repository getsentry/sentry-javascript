import { stringMatchesSomePattern } from '@sentry/core';

/**
 * Cloudflare frameworks that build on Durable Objects (`agents`, `partyserver`, ...) also manage
 * their own internal KV entries alongside their internal SQLite tables, namespaced with a reserved
 * prefix — e.g. `cf_agents_state`, `cf_agents_mcp_servers`, `__ps_name`. Reads/writes of these
 * (message persistence, MCP connection bookkeeping, name hydration) are framework implementation
 * details that otherwise flood traces with dozens of zero-signal `durable_object_storage_*` spans
 * per request, so we match the reserved prefixes rather than an enumerated list. This mirrors the
 * `cf_` convention used for internal SQL tables (see `targetsCloudflareInternalTable`).
 *
 * The prefixes are a reserved convention for framework-managed entries, so user keys should not use
 * them. In case a user key does collide, the `durableObjectStorageSpanAllowlist` option lets them
 * opt those keys back into instrumentation.
 */
export function targetsCloudflareInternalKey(key: string | undefined, allowlist?: Array<string | RegExp>): boolean {
  if (!key) {
    return false;
  }

  // Framework-managed KV namespaces:
  // - `cf_`   — agents / ai-chat internal state (mirrors the internal SQL table convention)
  // - `__ps_` — partyserver internals (e.g. `__ps_name`)
  // - `/`     — MCP OAuth client state (`/<clientName>/<serverId>/{token,client_info,state,...}`),
  //   read on every MCP tool call. User keys on an Agent rarely use a leading slash; if one does,
  //   the allowlist opts it back in.
  const isFrameworkKey = key.startsWith('cf_') || key.startsWith('__ps_') || key.startsWith('/');
  if (!isFrameworkKey) {
    return false;
  }

  // A key on the allowlist is treated as a user key and stays instrumented, even though it matches
  // a reserved prefix.
  return !allowlist?.length || !stringMatchesSomePattern(key, allowlist, true);
}

/**
 * Extracts the KV keys a Durable Object storage call targets, so the caller can decide whether the
 * operation only touches framework-internal entries. Returns `undefined` when the keys can't be
 * determined from the arguments (e.g. `list()` without a prefix), in which case the call is treated
 * as user work and stays instrumented.
 */
export function getStorageKeys(methodName: string, args: unknown[]): string[] | undefined {
  const [first] = args;

  if (methodName === 'get' || methodName === 'delete') {
    // get(key) / get(keys[]) / delete(key) / delete(keys[])
    if (typeof first === 'string') {
      return [first];
    }
    if (Array.isArray(first)) {
      return first.filter((k): k is string => typeof k === 'string');
    }
    return undefined;
  }

  if (methodName === 'put') {
    // put(key, value) or put({ key: value, ... })
    if (typeof first === 'string') {
      return [first];
    }
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return Object.keys(first);
    }
    return undefined;
  }

  if (methodName === 'list') {
    // list({ prefix })
    const prefix = first && typeof first === 'object' ? (first as { prefix?: unknown }).prefix : undefined;
    return typeof prefix === 'string' ? [prefix] : undefined;
  }

  return undefined;
}
