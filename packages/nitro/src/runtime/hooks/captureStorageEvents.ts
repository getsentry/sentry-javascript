import * as dc from 'node:diagnostics_channel';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import {
  GLOBAL_OBJ,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import { bindTracingChannelToSpan } from '@sentry/server-utils';
import type { TraceContext } from 'unstorage/tracing';

const ORIGIN = 'auto.cache.nitro';

const globalWithStorageChannels = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __SENTRY_NITRO_STORAGE_CHANNELS_INSTRUMENTED__: boolean;
};

const TRACED_OPERATIONS = [
  'hasItem',
  'getItem',
  'getItemRaw',
  'getItems',
  'setItem',
  'setItemRaw',
  'setItems',
  'removeItem',
  'getKeys',
  'clear',
] as const;

type TracedOperation = (typeof TRACED_OPERATIONS)[number];

const CACHE_HIT_OPERATIONS = new Set<TracedOperation>(['hasItem', 'getItem', 'getItemRaw', 'getItems']);

/**
 * Maps each unstorage operation to a convention cache op. Reads (including existence and key
 * listing) are `cache.get`, writes are `cache.put`, and deletions are `cache.remove`.
 * The precise operation stays available on `db.operation.name`.
 */
const OPERATION_SPAN_OPS = {
  hasItem: CACHE_GET,
  getItem: CACHE_GET,
  getItemRaw: CACHE_GET,
  getItems: CACHE_GET,
  getKeys: CACHE_GET,
  setItem: CACHE_PUT,
  setItemRaw: CACHE_PUT,
  setItems: CACHE_PUT,
  removeItem: CACHE_REMOVE,
  clear: CACHE_REMOVE,
} as const satisfies Record<TracedOperation, string>;

const CACHED_FN_HANDLERS_RE = /^nitro:(functions|handlers):/i;

/**
 * Subscribes to unstorage tracing channels and creates Sentry spans for storage operations.
 */
export function captureStorageEvents(): void {
  if (globalWithStorageChannels.__SENTRY_NITRO_STORAGE_CHANNELS_INSTRUMENTED__) {
    return;
  }

  for (const operation of TRACED_OPERATIONS) {
    setupStorageTracingChannel(operation);
  }

  globalWithStorageChannels.__SENTRY_NITRO_STORAGE_CHANNELS_INSTRUMENTED__ = true;
}

function setupStorageTracingChannel(operation: TracedOperation): void {
  const keys = (data: TraceContext): string[] => data.keys ?? [];
  const mountBase = (data: TraceContext): string => (data.base ?? '').replace(/:$/, '');

  // Bail if this is not available
  if (!dc.tracingChannel) {
    return;
  }

  bindTracingChannelToSpan(
    dc.tracingChannel<TraceContext>(`unstorage.${operation}`),
    data => {
      const cacheKeys = keys(data);

      return startInactiveSpan({
        name: cacheKeys.join(', ') || operation,
        attributes: {
          [SENTRY_OP]: OPERATION_SPAN_OPS[operation],
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_CACHE_KEY]: cacheKeys.length > 1 ? cacheKeys : cacheKeys[0],
          'db.operation.name': operation,
          'db.collection.name': mountBase(data),
          'db.system.name': data.driver?.name ?? 'unknown',
        },
      });
    },
    {
      beforeSpanEnd(span, data) {
        // Error status is set by the binding; the error itself is captured at the request boundary,
        // not here (cache ops aren't an error boundary). Only enrich the success path.
        if (!('error' in data)) {
          const result = (data as { result?: unknown }).result;
          if (CACHE_HIT_OPERATIONS.has(operation)) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, resolveCacheHit(operation, data.keys?.[0], result));
          }
        }

        void flushIfServerless();
      },
    },
  );
}

/**
 * Resolves the `cache.hit` value for a read operation. `hasItem` returns a boolean directly,
 * `getItems` returns a `{ key, value }[]` where a hit means at least one entry has a value,
 * and single-key reads fall back to the value-based `isCacheHit` check.
 */
function resolveCacheHit(operation: TracedOperation, key: unknown, result: unknown): boolean {
  if (operation === 'hasItem') {
    return Boolean(result);
  }

  if (operation === 'getItems') {
    return Array.isArray(result) && result.some(item => isObjectLike(item) && item.value != null);
  }

  return isCacheHit(key, result);
}

interface CacheEntry<T = unknown> {
  value?: T;
  expires?: number;
}

interface ResponseCacheEntry {
  status?: number;
  body?: unknown;
  headers?: Record<string, string | undefined>;
}

function isCacheHit(key: unknown, value: unknown): boolean {
  try {
    const isEmpty = value == null;
    if (isEmpty || typeof key !== 'string' || !CACHED_FN_HANDLERS_RE.test(key)) {
      return !isEmpty;
    }

    const entry = typeof value === 'string' ? (JSON.parse(value) as CacheEntry) : (value as CacheEntry);

    return validateCacheEntry(key, entry);
  } catch {
    return false;
  }
}

function validateCacheEntry(
  key: string,
  entry: CacheEntry | CacheEntry<ResponseCacheEntry & { status: number }>,
): boolean {
  if (entry.value == null) {
    return false;
  }

  if (Date.now() > (entry.expires || 0)) {
    return false;
  }

  if (isResponseCacheEntry(key, entry)) {
    if ((entry.value.status ?? 0) >= 400) {
      return false;
    }

    if (entry.value.body === undefined) {
      return false;
    }

    if (entry.value.headers?.etag === 'undefined' || entry.value.headers?.['last-modified'] === 'undefined') {
      return false;
    }
  }

  return true;
}

function isResponseCacheEntry(key: string, _: CacheEntry): _ is CacheEntry<ResponseCacheEntry & { status: number }> {
  return key.startsWith('nitro:handlers:');
}
