import { SENTRY_PROFILE_ID, SENTRY_EXCLUSIVE_TIME } from '@sentry/conventions/attributes';
import type { TransactionEvent } from '../types/event';
import type { SpanJSON } from '../types/span';

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
    status: status ?? 'ok',
    timestamp: event.timestamp,
    trace_id: trace_id ?? '',
    origin,
    profile_id: data?.[SENTRY_PROFILE_ID] as string | undefined,
    exclusive_time: data?.[SENTRY_EXCLUSIVE_TIME] as number | undefined,
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
          ...(span.profile_id && { [SENTRY_PROFILE_ID]: span.profile_id }),
          ...(span.exclusive_time && { [SENTRY_EXCLUSIVE_TIME]: span.exclusive_time }),
        },
      },
    },
    measurements: span.measurements,
  };
}
