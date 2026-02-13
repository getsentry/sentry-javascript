import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { TraceFlags } from '@opentelemetry/api';
import { getActiveSpan } from '@sentry/core';

/** Storage key prefix for the span context that links consecutive method invocations */
const SENTRY_TRACE_LINK_KEY_PREFIX = '__SENTRY_TRACE_LINK__';

/** Stored span context for creating span links */
export interface StoredSpanContext {
  traceId: string;
  spanId: string;
}

/** Span link structure for connecting traces */
export interface SpanLink {
  context: {
    traceId: string;
    spanId: string;
    traceFlags: number;
  };
  attributes?: Record<string, string>;
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
 */
export async function storeSpanContext(originalStorage: DurableObjectStorage, methodName: string): Promise<void> {
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    const storedContext: StoredSpanContext = {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
    await originalStorage.put(getTraceLinkKey(methodName), storedContext);
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
    // Ignore errors reading stored context
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
        traceFlags: TraceFlags.SAMPLED,
      },
      attributes: {
        'sentry.link.type': 'previous_trace',
      },
    },
  ];
}
