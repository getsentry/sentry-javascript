import type { RawAttributes } from '../../attributes';
import type { SerializedStreamedSpan, SpanJSON, StreamedSpanJSON } from '../../types/span';
import { streamedSpanJsonToSerializedSpan } from '../../utils/spanUtils';

/**
 * Converts a v1 SpanJSON (from a legacy transaction) to the intermediate v2 {@link StreamedSpanJSON}
 * (raw attributes), before serialization. Use this when a hook needs to mutate the span JSON.
 */
export function spanJsonToStreamedSpanJSON(span: SpanJSON): StreamedSpanJSON {
  return {
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
}

/**
 * Converts a v1 SpanJSON (from a legacy transaction) to a serialized v2 StreamedSpan.
 */
export function spanJsonToSerializedStreamedSpan(span: SpanJSON): SerializedStreamedSpan {
  return streamedSpanJsonToSerializedSpan(spanJsonToStreamedSpanJSON(span));
}
