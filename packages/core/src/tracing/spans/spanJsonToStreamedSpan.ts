import type { RawAttributes } from '../../attributes';
import {
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_PROFILE_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '../../semanticAttributes';
import type { SerializedStreamedSpan, SpanJSON, StreamedSpanJSON } from '../../types/span';
import { streamedSpanJsonToSerializedSpan } from '../../utils/spanUtils';

// v1 SpanJSON mirrors some attributes as top-level fields (see `SentrySpan.getSpanJSON`). A
// `beforeSendSpan` callback edits the top-level field, so those edits have to be folded back into
// attributes, letting the top-level value win over the (initially identical) attribute. This is the
// inverse of `getSpanJSON` and mirrors how `convertSpanJsonToTransactionEvent` rebuilds `data`.
const TOP_LEVEL_ATTRIBUTE_FIELDS = [
  ['op', SEMANTIC_ATTRIBUTE_SENTRY_OP],
  ['origin', SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
  ['profile_id', SEMANTIC_ATTRIBUTE_PROFILE_ID],
  ['exclusive_time', SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME],
] as const;

/**
 * Converts a v1 SpanJSON (from a legacy transaction) to a serialized v2 StreamedSpan.
 */
export function spanJsonToSerializedStreamedSpan(span: SpanJSON): SerializedStreamedSpan {
  const attributes = { ...(span.data as RawAttributes<Record<string, unknown>>) };

  for (const [field, attribute] of TOP_LEVEL_ATTRIBUTE_FIELDS) {
    attributes[attribute] = span[field] ?? attributes[attribute];
  }

  const streamedSpan: StreamedSpanJSON = {
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    name: span.description || '',
    start_timestamp: span.start_timestamp,
    end_timestamp: span.timestamp || span.start_timestamp,
    status: !span.status || span.status === 'ok' || span.status === 'cancelled' ? 'ok' : 'error',
    is_segment: false,
    attributes,
    links: span.links,
  };

  return streamedSpanJsonToSerializedSpan(streamedSpan);
}
