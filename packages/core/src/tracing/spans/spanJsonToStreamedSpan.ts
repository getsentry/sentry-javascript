import type { RawAttributes } from '../../attributes';
import type { Client } from '../../client';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
} from '../../semanticAttributes';
import type { Event } from '../../types-hoist/event';
import type { SerializedStreamedSpan, SpanJSON, StreamedSpanJSON } from '../../types-hoist/span';
import { streamedSpanJsonToSerializedSpan } from '../../utils/spanUtils';
import { safeSetSpanJSONAttributes } from './captureSpan';

/**
 * Converts a v1 SpanJSON (from a legacy transaction) to a serialized v2 StreamedSpan.
 */
export function spanJsonToSerializedStreamedSpan(
  span: SpanJSON,
  transactionEvent: Event,
  client: Client,
): SerializedStreamedSpan {
  const streamedSpan: StreamedSpanJSON = {
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    name: span.description || '',
    start_timestamp: span.start_timestamp,
    end_timestamp: span.timestamp || span.start_timestamp,
    status: mapV1StatusToV2(span.status),
    is_segment: false,
    attributes: { ...(span.data as RawAttributes<Record<string, unknown>>) },
    links: span.links,
  };

  // Fold op and origin into attributes
  safeSetSpanJSONAttributes(streamedSpan, {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: span.op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: span.origin,
  });

  // Enrich from transaction event context (same pattern as captureSpan.ts applyCommonSpanAttributes)
  const sdk = client.getSdkMetadata();
  const { release, environment, sendDefaultPii } = client.getOptions();

  safeSetSpanJSONAttributes(streamedSpan, {
    [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: transactionEvent.release || release,
    [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: transactionEvent.environment || environment,
    [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: transactionEvent.transaction,
    [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: transactionEvent.contexts?.trace?.span_id,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: sdk?.sdk?.name,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: sdk?.sdk?.version,
    ...(sendDefaultPii
      ? {
          [SEMANTIC_ATTRIBUTE_USER_ID]: transactionEvent.user?.id,
          [SEMANTIC_ATTRIBUTE_USER_EMAIL]: transactionEvent.user?.email,
          [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: transactionEvent.user?.ip_address,
          [SEMANTIC_ATTRIBUTE_USER_USERNAME]: transactionEvent.user?.username,
        }
      : {}),
  });

  return streamedSpanJsonToSerializedSpan(streamedSpan);
}

function mapV1StatusToV2(status: string | undefined): 'ok' | 'error' {
  if (!status || status === 'ok' || status === 'cancelled') {
    return 'ok';
  }
  return 'error';
}
