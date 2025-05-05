import { SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME, SEMANTIC_ATTRIBUTE_PROFILE_ID } from '../semanticAttributes';
import type { TransactionEvent } from '../types-hoist/event';
import type { SpanJSON } from '../types-hoist/span';

/**
 * Converts a transaction event to a span JSON object.
 */
export function convertTransactionEventToSpanJson(event: TransactionEvent): SpanJSON {
  const { trace_id, parent_span_id, span_id, status, origin, data, op } = event.contexts?.trace ?? {};

  return {
    data: data ?? {},
    description: event.transaction,
    op,
    parent_span_id,
    span_id: span_id ?? '',
    start_timestamp: event.start_timestamp ?? 0,
    status,
    timestamp: event.timestamp,
    trace_id: trace_id ?? '',
    origin,
    profile_id: data?.[SEMANTIC_ATTRIBUTE_PROFILE_ID] as string | undefined,
    exclusive_time: data?.[SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME] as number | undefined,
    measurements: event.measurements,
    is_segment: true,
  };
}

/**
 * Converts a span JSON object to a transaction event.
 */
export function convertSpanJsonToTransactionEvent(span: SpanJSON): TransactionEvent {
  return {
    type: 'transaction',
    timestamp: span.timestamp,
    start_timestamp: span.start_timestamp,
    transaction: span.description,
    contexts: {
      trace: {
        trace_id: span.trace_id,
        span_id: span.span_id,
        parent_span_id: span.parent_span_id,
        op: span.op,
        status: span.status,
        origin: span.origin,
        data: {
          ...span.data,
          ...(span.profile_id && { [SEMANTIC_ATTRIBUTE_PROFILE_ID]: span.profile_id }),
          ...(span.exclusive_time && { [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: span.exclusive_time }),
        },
      },
    },
    measurements: span.measurements,
  };
}
