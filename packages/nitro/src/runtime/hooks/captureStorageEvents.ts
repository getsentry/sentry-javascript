import {
  captureException,
  flushIfServerless,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpanManual,
} from '@sentry/core';
import { tracingChannel, type TracingChannelContextWithSpan } from '@sentry/opentelemetry/tracing-channel';
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

const CACHE_HIT_OPERATIONS = new Set<TracedOperation>(['hasItem', 'getItem', 'getItemRaw']);

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

  const channel = tracingChannel<TraceContext>(`unstorage.${operation}`, data => {
    const cacheKeys = keys(data);

    return startSpanManual(
      {
        name: cacheKeys.join(', ') || operation,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `cache.${normalizeMethodName(operation)}`,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_CACHE_KEY]: cacheKeys.length > 1 ? cacheKeys : cacheKeys[0],
          'db.operation.name': operation,
          'db.collection.name': mountBase(data),
          'db.system.name': data.driver?.name ?? 'unknown',
        },
      },
      span => span,
    );
  });

  channel.subscribe({
    asyncEnd(data: TracingChannelContextWithSpan<TraceContext & { result?: unknown }>) {
      if (data._sentrySpan && CACHE_HIT_OPERATIONS.has(operation)) {
        data._sentrySpan.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, isCacheHit(data.keys?.[0], data.result));
      }

      data._sentrySpan?.setStatus({ code: SPAN_STATUS_OK });
      data._sentrySpan?.end();

      void flushIfServerless();
    },
    error(data: TracingChannelContextWithSpan<TraceContext & { error?: unknown }>) {
      captureException(data.error, {
        mechanism: { handled: false, type: ORIGIN },
      });

      data._sentrySpan?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      data._sentrySpan?.end();

      void flushIfServerless();
    },
  });
}

function normalizeMethodName(methodName: string): string {
  return methodName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function isEmptyValue(value: unknown): value is null | undefined {
  return value === null || value === undefined;
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
    const isEmpty = isEmptyValue(value);
    if (isEmpty || typeof key !== 'string' || !CACHED_FN_HANDLERS_RE.test(key)) {
      return !isEmpty;
    }

    return validateCacheEntry(key, JSON.parse(String(value)) as CacheEntry);
  } catch {
    return false;
  }
}

function validateCacheEntry(
  key: string,
  entry: CacheEntry | CacheEntry<ResponseCacheEntry & { status: number }>,
): boolean {
  if (isEmptyValue(entry.value)) {
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
