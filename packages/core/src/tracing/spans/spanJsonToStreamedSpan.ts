import type { RawAttributes } from '../../attributes';
import type { SerializedStreamedSpan, SpanJSON, StreamedSpanJSON } from '../../types-hoist/span';
import { streamedSpanJsonToSerializedSpan } from '../../utils/spanUtils';

/**
 * Converts a v1 SpanJSON (from a legacy transaction) to a serialized v2 StreamedSpan.
 */
export function spanJsonToSerializedStreamedSpan(span: SpanJSON): SerializedStreamedSpan {
  const streamedSpan: StreamedSpanJSON = {
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    name: span.description || '',
    start_timestamp: span.start_timestamp,
    end_timestamp: span.timestamp || span.start_timestamp,
    status: !span.status || span.status === 'ok' || span.status === 'cancelled' ? 'ok' : 'error',
    is_segment: false,
    attributes: { ...(span.data as RawAttributes<Record<string, unknown>>) },
    links: span.links,
  };

  return streamedSpanJsonToSerializedSpan(streamedSpan);
}
