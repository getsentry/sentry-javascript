import type { RawAttributes } from '../../attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import type { SpanLinkJSON } from '../../types/link';
import type { SerializedStreamedSpan, SpanAttributes, SpanJSON, SpanOrigin, StreamedSpanJSON } from '../../types/span';
import { streamedSpanJsonToSerializedSpan } from '../../utils/spanUtils';

/**
 * Converts a v1 SpanJSON (from a legacy transaction) to an intermediate v2 StreamedSpanJSON.
 */
export function spanJsonToStreamedSpanJson(span: SpanJSON): StreamedSpanJSON {
  // `op` and `origin` are dedicated fields on a v1 span but plain attributes on a v2 span. Copy them
  // back so that writes to the v1 fields (e.g. in a `withStaticSpan` callback) aren't dropped.
  const attributes = { ...span.data } as RawAttributes<Record<string, unknown>>;
  if (span.op !== undefined) {
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = span.op;
  }
  if (span.origin !== undefined) {
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = span.origin;
  }

  return {
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    name: span.description || '',
    start_timestamp: span.start_timestamp,
    end_timestamp: span.timestamp || span.start_timestamp,
    status: !span.status || span.status === 'ok' || span.status === 'cancelled' ? 'ok' : 'error',
    is_segment: span.is_segment ?? false,
    attributes,
    links: span.links,
  };
}

/**
 * Converts a v1 SpanJSON (from a legacy transaction) to a serialized v2 StreamedSpan.
 */
export function spanJsonToSerializedStreamedSpan(span: SpanJSON): SerializedStreamedSpan {
  return streamedSpanJsonToSerializedSpan(spanJsonToStreamedSpanJson(span));
}

/**
 * Converts an intermediate v2 StreamedSpanJSON back to a v1 SpanJSON.
 *
 * The inverse of {@link spanJsonToStreamedSpanJson}, used to hand a `withStaticSpan` `beforeSendSpan`
 * callback the v1 format it expects for spans that are streamed despite the static trace lifecycle.
 *
 * v1 fields that have no v2 counterpart (`measurements`, `segment_id`) are not restored.
 * `profile_id` and `exclusive_time` stay readable through `data`.
 */
export function streamedSpanJsonToSpanJson(span: StreamedSpanJSON): SpanJSON {
  const data = { ...span.attributes } as SpanAttributes;

  return {
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    description: span.name,
    start_timestamp: span.start_timestamp,
    timestamp: span.end_timestamp,
    status: span.status,
    is_segment: span.is_segment,
    data,
    op: data[SEMANTIC_ATTRIBUTE_SENTRY_OP],
    origin: data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined,
    links: span.links as SpanLinkJSON[] | undefined,
  };
}
