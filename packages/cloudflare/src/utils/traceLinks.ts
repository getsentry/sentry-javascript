import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { TraceFlags } from '@opentelemetry/api';
import type { SpanLink } from '@sentry/core';
import { debug, getActiveSpan, SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE, spanIsSampled } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/** Storage key prefix for the span context that links consecutive method invocations */
const SENTRY_TRACE_LINK_KEY_PREFIX = '__SENTRY_TRACE_LINK__';

/** Stored span context for creating span links */
export interface StoredSpanContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/**
 * Gets the storage key for a specific method's trace link.
 */
export function getTraceLinkKey(methodName: string): string {
  return `${SENTRY_TRACE_LINK_KEY_PREFIX}${methodName}`;
}

/**
 * Stores the current span context in Durable Object storage for trace linking.
 * Uses the original uninstrumented storage to avoid creating spans for internal operations.
 * Errors are silently ignored to prevent internal storage failures from propagating to user code.
 */
export async function storeSpanContext(originalStorage: DurableObjectStorage, methodName: string): Promise<void> {
  try {
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      const storedContext: StoredSpanContext = {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        sampled: spanIsSampled(activeSpan),
      };
      await originalStorage.put(getTraceLinkKey(methodName), storedContext);
    }
  } catch (error) {
    // Silently ignore storage errors to prevent internal failures from affecting user code
    DEBUG_BUILD && debug.log(`[CloudflareClient] Error storing span context for method ${methodName}`, error);
  }
}

/**
 * Retrieves a stored span context from Durable Object storage.
 */
export async function getStoredSpanContext(
  originalStorage: DurableObjectStorage,
  methodName: string,
): Promise<StoredSpanContext | undefined> {
  try {
    return await originalStorage.get<StoredSpanContext>(getTraceLinkKey(methodName));
  } catch {
    return undefined;
  }
}

/**
 * Builds span links from a stored span context.
 */
export function buildSpanLinks(storedContext: StoredSpanContext): SpanLink[] {
  return [
    {
      context: {
        traceId: storedContext.traceId,
        spanId: storedContext.spanId,
        traceFlags: storedContext.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
      },
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    },
  ];
}
