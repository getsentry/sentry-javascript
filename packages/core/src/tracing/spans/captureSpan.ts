import type { RawAttributes } from '../../attributes';
import type { Client } from '../../client';
import type { ScopeData } from '../../scope';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
} from '../../semanticAttributes';
import type { SerializedStreamedSpan, Span, SpanAttributeValue, SpanJSON, StreamedSpanJSON } from '../../types/span';
import { getCombinedScopeData } from '../../utils/scopeData';
import {
  INTERNAL_getSegmentSpan,
  spanToStaticSpanJSON,
  spanToJSON,
  streamedSpanJsonToSerializedSpan,
} from '../../utils/spanUtils';
import { getCapturedScopesOnSpan } from '../utils';
import { applyBeforeSendSpanCallback, isStaticBeforeSendSpanCallback } from './beforeSendSpan';
import { spanJsonToSerializedStreamedSpan } from './spanJsonToStreamedSpan';
import { scopeContextsToSpanAttributes } from './scopeContextAttributes';
import { DEFAULT_ENVIRONMENT } from '../../constants';
import {
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME,
  SENTRY_TRACE_LIFECYCLE,
} from '@sentry/conventions/attributes';

export type SerializedStreamedSpanWithSegmentSpan = SerializedStreamedSpan & {
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
  const spanJSON = spanToJSON(span);

  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToJSON(segmentSpan);

  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);

  const finalScopeData = getCombinedScopeData(spanIsolationScope, spanScope);

  applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, finalScopeData);

  // Preprocess the span JSON before any other hooks run, so that `processSpan`/`processSegmentSpan`
  // subscribers (incl. integrations) and `beforeSendSpan` see fully inferred span data.
  client.emit('preprocessSpan', spanJSON);

  if (spanJSON.is_segment) {
    applyScopeToSegmentSpan(spanJSON, finalScopeData);
    applySdkMetadataToSegmentSpan(spanJSON, client);
    // Allow hook subscribers to mutate the segment span JSON
    // This also invokes the `processSegmentSpan` hook of all integrations
    client.emit('processSegmentSpan', spanJSON);
  }

  // This allows hook subscribers to mutate the span JSON
  // This also invokes the `processSpan` hook of all integrations
  client.emit('processSpan', spanJSON);

  const { beforeSendSpan, traceLifecycle } = client.getOptions();
  const processedSpan =
    // check for traceLifecycle here because in static lifecycle,
    // captureSpan is called for INP spans. If an unmigrated beforeSendSpan
    // callback is run on these spans, it will throw an error.
    traceLifecycle !== 'static' && beforeSendSpan && !isStaticBeforeSendSpanCallback(beforeSendSpan)
      ? applyBeforeSendSpanCallback(spanJSON, beforeSendSpan)
      : spanJSON;

  const spanNameSource = processedSpan.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  if (spanJSON.is_segment && spanNameSource) {
    // Backfill sentry.segment.name.source from sentry.source.
    // TODO(v11): Remove this backfill once we removed setting SEMANTIC_ATTRIBUTE_SENTRY_SOURCE in favour of
    // SENTRY_SEGMENT_NAME_SOURCE from @sentry/conventions/attributes only on segment spans.
    safeSetSpanJSONAttributes(processedSpan, {
      ['sentry.segment.name.source']: spanNameSource,
    });
  }

  return {
    ...streamedSpanJsonToSerializedSpan(processedSpan),
    _segmentSpan: segmentSpan,
  };
}

function applyScopeToSegmentSpan(segmentSpanJSON: StreamedSpanJSON, scopeData: ScopeData): void {
  const contextAttributes = scopeContextsToSpanAttributes(scopeData.contexts);
  safeSetSpanJSONAttributes(segmentSpanJSON, contextAttributes);
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

  Object.entries(newAttributes).forEach(([key, value]) => {
    if (value != null && !(key in originalAttributes)) {
      originalAttributes[key] = value;
    }
  });
}

function applySdkMetadataToSegmentSpan(segmentSpanJSON: StreamedSpanJSON, client: Client): void {
  const integrationNames = client.getIntegrationNames();
  if (!integrationNames.length) return;

  safeSetSpanJSONAttributes(segmentSpanJSON, {
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS]: integrationNames,
  });
}

function commonSpanAttributes(
  serializedSegmentSpan: StreamedSpanJSON,
  client: Client,
  scopeData: ScopeData,
  // TODO(standalone): remove this param (always include scope attributes) once the static (transaction)
  // trace lifecycle is dropped and standalone spans no longer need to look transaction-shaped.
  includeScopeAttributes = true,
): RawAttributes<Record<string, unknown>> {
  const sdk = client.getSdkMetadata();
  const { release, environment } = client.getOptions();

  return {
    [SENTRY_TRACE_LIFECYCLE]: 'stream',
    [SENTRY_SEGMENT_NAME]: serializedSegmentSpan.name,
    [SENTRY_SEGMENT_ID]: serializedSegmentSpan.span_id,
    [SENTRY_SDK_NAME]: sdk?.sdk?.name,
    [SENTRY_SDK_VERSION]: sdk?.sdk?.version,
    [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: release,
    [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: environment || DEFAULT_ENVIRONMENT,
    [SEMANTIC_ATTRIBUTE_USER_ID]: scopeData.user?.id,
    [SEMANTIC_ATTRIBUTE_USER_EMAIL]: scopeData.user?.email,
    [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: scopeData.user?.ip_address,
    [SEMANTIC_ATTRIBUTE_USER_USERNAME]: scopeData.user?.username,
    ...(includeScopeAttributes ? scopeData.attributes : undefined),
  };
}

function applyCommonSpanAttributes(
  spanJSON: StreamedSpanJSON,
  serializedSegmentSpan: StreamedSpanJSON,
  client: Client,
  scopeData: ScopeData,
): void {
  // avoid overwriting any previously set attributes (from users or potentially our SDK instrumentation)
  safeSetSpanJSONAttributes(spanJSON, commonSpanAttributes(serializedSegmentSpan, client, scopeData));
}

/**
 * Captures a standalone span whose `beforeSendSpan` callback expects the v1 {@link SpanJSON} format
 * (i.e. the user opted out of span streaming). The span is serialized to v1, the common attributes are
 * applied, the callback runs in its native format, and the result is converted forward to a serialized
 * v2 span. This mirrors how gen_ai spans reach the v2 span path from a static transaction (a plain
 * conversion, no `processSpan` hooks), so there is never a reverse v2 -> v1 conversion.
 *
 * TODO(standalone): remove once the static (transaction) trace lifecycle is dropped.
 */
export function captureStandaloneSpanWithStaticCallback(
  span: Span,
  client: Client,
  beforeSendSpan: (span: SpanJSON) => SpanJSON,
): SerializedStreamedSpan {
  const spanJSON = spanToStaticSpanJSON(span);

  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToJSON(segmentSpan);

  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);
  const finalScopeData = getCombinedScopeData(spanIsolationScope, spanScope);

  // Skip scope attributes: their `{ unit, value }` shape is unexpected for a static callback, and like
  // transactions, standalone spans don't get them.
  const commonAttributes = commonSpanAttributes(serializedSegmentSpan, client, finalScopeData, false);
  Object.entries(commonAttributes).forEach(([key, value]) => {
    if (value != null && !(key in spanJSON.data)) {
      spanJSON.data[key] = value as SpanAttributeValue;
    }
  });

  const processedSpan = applyBeforeSendSpanCallback(spanJSON, beforeSendSpan);

  return spanJsonToSerializedStreamedSpan(processedSpan);
}
