import { DEBUG_BUILD } from '../debug-build';
import { SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME, SEMANTIC_ATTRIBUTE_PROFILE_ID } from '../semanticAttributes';
import type { Event, SpanJSON } from '../types-hoist';
import { logger } from '../utils-hoist';

/**
 * Get a list of possible event messages from a Sentry event.
 */
export function getPossibleEventMessages(event: Event): string[] {
  const possibleMessages: string[] = [];

  if (event.message) {
    possibleMessages.push(event.message);
  }

  try {
    // @ts-expect-error Try catching to save bundle size
    const lastException = event.exception.values[event.exception.values.length - 1];
    if (lastException && lastException.value) {
      possibleMessages.push(lastException.value);
      if (lastException.type) {
        possibleMessages.push(`${lastException.type}: ${lastException.value}`);
      }
    }
  } catch (e) {
    // ignore errors here
  }

  return possibleMessages;
}

/**
 * Converts a transaction event to a span JSON object.
 */
export function convertTransactionEventToSpanJson(event: Event): SpanJSON | undefined {
  if (!(event.type === 'transaction')) {
    DEBUG_BUILD && logger.warn('Event is not a transaction, cannot convert to span JSON');
    return;
  }

  const { trace_id, parent_span_id, span_id, status, origin, data, op } = event.contexts?.trace ?? {};

  return {
    data: data ?? {},
    description: event.transaction,
    op,
    parent_span_id: parent_span_id ?? '',
    span_id: span_id ?? '',
    start_timestamp: event.start_timestamp ?? 0,
    status,
    timestamp: event.timestamp,
    trace_id: trace_id ?? '',
    origin,
    profile_id: data?.[SEMANTIC_ATTRIBUTE_PROFILE_ID] as string | undefined,
    exclusive_time: data?.[SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME] as number | undefined,
    measurements: event.measurements,
  };
}
