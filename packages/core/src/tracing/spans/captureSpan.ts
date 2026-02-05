import type { RawAttributes } from '../../attributes';
import type { Client } from '../../client';
import type { ScopeData } from '../../scope';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SPAN_SOURCE,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
} from '../../semanticAttributes';
import type { SerializedStreamedSpan, Span, StreamedSpanJSON } from '../../types-hoist/span';
import { isStreamedBeforeSendSpanCallback } from '../../utils/beforeSendSpan';
import { getCombinedScopeData } from '../../utils/scopeData';
import {
  INTERNAL_getSegmentSpan,
  showSpanDropWarning,
  spanToStreamedSpanJSON,
  streamedSpanJsonToSerializedSpan,
} from '../../utils/spanUtils';
import { getCapturedScopesOnSpan } from '../utils';

type SerializedStreamedSpanWithSegmentSpan = SerializedStreamedSpan & {
  _segmentSpan: Span;
};

/**
 * Captures a span and returns a JSON representation to be enqueued for sending.
 *
 * IMPORTANT: This function converts the span to JSON immediately to avoid writing
 * to an already-ended OTel span instance (which is blocked by the OTel Span class).
 *
 * @returns the final serialized span with a reference to its segment span. This reference
 * is needed later on to compute the DSC for the span envelope.
 */
export function captureSpan(span: Span, client: Client): SerializedStreamedSpanWithSegmentSpan {
  // Convert to JSON FIRST - we cannot write to an already-ended span
  const spanJSON = spanToStreamedSpanJSON(span);

  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToStreamedSpanJSON(segmentSpan);

  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);

  const finalScopeData = getCombinedScopeData(spanIsolationScope, spanScope);

  applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, finalScopeData);

  if (span === segmentSpan) {
    applyScopeToSegmentSpan(spanJSON, finalScopeData);
    // Allow hook subscribers to add additional data to the segment span JSON
    client.emit('processSegmentSpan', spanJSON);
  }

  // Allow hook subscribers to add additional data to the span JSON
  client.emit('processSpan', spanJSON);

  const { beforeSendSpan } = client.getOptions();
  const processedSpan =
    beforeSendSpan && isStreamedBeforeSendSpanCallback(beforeSendSpan)
      ? applyBeforeSendSpanCallback(spanJSON, beforeSendSpan)
      : spanJSON;

  // Backfill sentry.span.source from sentry.source for the PoC
  // TODO(v11): Stop sending `sentry.source` attribute and only send `sentry.span.source`
  if (processedSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]) {
    safeSetSpanJSONAttributes(processedSpan, {
      [SEMANTIC_ATTRIBUTE_SENTRY_SPAN_SOURCE]: processedSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE],
    });
    delete processedSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  }

  return {
    ...streamedSpanJsonToSerializedSpan(processedSpan),
    _segmentSpan: segmentSpan,
  };
}

function applyScopeToSegmentSpan(_segmentSpanJSON: StreamedSpanJSON, _scopeData: ScopeData): void {
  // TODO: Apply all scope and request data from auto instrumentation (contexts, request) to segment span
  // This will follow in a separate PR
}

function applyCommonSpanAttributes(
  spanJSON: StreamedSpanJSON,
  serializedSegmentSpan: StreamedSpanJSON,
  client: Client,
  scopeData: ScopeData,
): void {
  const sdk = client.getSdkMetadata();
  const { release, environment, sendDefaultPii } = client.getOptions();

  // avoid overwriting any previously set attributes (from users or potentially our SDK instrumentation)
  safeSetSpanJSONAttributes(spanJSON, {
    [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: release,
    [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: environment,
    [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: serializedSegmentSpan.name,
    [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: serializedSegmentSpan.span_id,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: sdk?.sdk?.name,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: sdk?.sdk?.version,
    ...(sendDefaultPii
      ? {
          [SEMANTIC_ATTRIBUTE_USER_ID]: scopeData.user?.id,
          [SEMANTIC_ATTRIBUTE_USER_EMAIL]: scopeData.user?.email,
          [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: scopeData.user?.ip_address,
          [SEMANTIC_ATTRIBUTE_USER_USERNAME]: scopeData.user?.username,
        }
      : {}),
    ...scopeData.attributes,
  });
}

/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
export function applyBeforeSendSpanCallback(
  span: StreamedSpanJSON,
  beforeSendSpan: (span: StreamedSpanJSON) => StreamedSpanJSON,
): StreamedSpanJSON {
  const modifedSpan = beforeSendSpan(span);
  if (!modifedSpan) {
    showSpanDropWarning();
    return span;
  }
  return modifedSpan;
}

/**
 * Safely set attributes on a span JSON.
 * If an attribute already exists, it will not be overwritten.
 */
export function safeSetSpanJSONAttributes(
  spanJSON: StreamedSpanJSON,
  newAttributes: RawAttributes<Record<string, unknown>>,
): void {
  const originalAttributes = spanJSON.attributes ?? (spanJSON.attributes = {});

  Object.keys(newAttributes).forEach(key => {
    if (!originalAttributes?.[key]) {
      originalAttributes[key] = newAttributes[key];
    }
  });
}
