import type { Client } from '../client';
import { getClient, getGlobalScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Scope, ScopeData } from '../scope';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
} from '../semanticAttributes';
import { getCapturedScopesOnSpan } from '../tracing/utils';
import type { SerializedAttributes } from '../types-hoist/attributes';
import type { Span, SpanV2JSON } from '../types-hoist/span';
import { mergeScopeData } from '../utils/applyScopeDataToEvent';
import { debug } from '../utils/debug-logger';
import { INTERNAL_getSegmentSpan, spanToV2JSON } from '../utils/spanUtils';
import { safeSetSpanJSONAttributes } from './spanFirstUtils';

/**
 * A SpanV2JSON with an attached reference to the segment span.
 * This reference is used to compute dynamic sampling context before sending.
 * The reference MUST be removed before sending the span envelope.
 */
export interface SpanV2JSONWithSegmentRef extends SpanV2JSON {
  _segmentSpan: Span;
}

/**
 * Captures a span and returns a JSON representation to be enqueued for sending.
 *
 * IMPORTANT: This function converts the span to JSON immediately to avoid writing
 * to an already-ended OTel span instance (which is blocked by the OTel Span class).
 */
export function captureSpan(span: Span, client = getClient()): SpanV2JSONWithSegmentRef | void {
  if (!client) {
    DEBUG_BUILD && debug.warn('No client available to capture span.');
    return;
  }

  // Convert to JSON FIRST - we cannot write to an already-ended span
  const spanJSON = spanToV2JSON(span) as SpanV2JSONWithSegmentRef;

  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToV2JSON(segmentSpan);

  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);
  const finalScopeData = getFinalScopeData(spanIsolationScope, spanScope);

  const originalAttributes = serializedSegmentSpan.attributes ?? {};

  applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, finalScopeData, originalAttributes);

  if (span === segmentSpan) {
    applyScopeToSegmentSpan(spanJSON, finalScopeData, originalAttributes);
  }

  // Attach segment span reference for DSC generation at send time
  spanJSON._segmentSpan = segmentSpan;

  // Allow integrations to add additional data to the span JSON
  client.emit('processSpan', spanJSON, { readOnlySpan: span });

  // Enqueue the JSON representation for sending
  // Note: We now enqueue JSON instead of the span instance to avoid mutating ended spans
  client.emit('enqueueSpan', spanJSON);

  return spanJSON;
}

function applyScopeToSegmentSpan(
  segmentSpanJSON: SpanV2JSON,
  scopeData: ScopeData,
  originalAttributes: SerializedAttributes,
): void {
  // TODO: Apply all scope data from auto instrumentation (contexts, request) to segment span
  const { attributes } = scopeData;
  if (attributes) {
    safeSetSpanJSONAttributes(segmentSpanJSON, attributes, originalAttributes);
  }
}

function applyCommonSpanAttributes(
  spanJSON: SpanV2JSON,
  serializedSegmentSpan: SpanV2JSON,
  client: Client,
  scopeData: ScopeData,
  originalAttributes: SerializedAttributes,
): void {
  const sdk = client.getSdkMetadata();
  const { release, environment, sendDefaultPii } = client.getOptions();

  // avoid overwriting any previously set attributes (from users or potentially our SDK instrumentation)
  safeSetSpanJSONAttributes(
    spanJSON,
    {
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
            [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: scopeData.user?.ip_address ?? undefined,
            [SEMANTIC_ATTRIBUTE_USER_USERNAME]: scopeData.user?.username,
          }
        : {}),
    },
    originalAttributes,
  );
}

// TODO: Extract this to a helper in core. It's used in multiple places.
function getFinalScopeData(isolationScope: Scope | undefined, scope: Scope | undefined): ScopeData {
  const finalScopeData = getGlobalScope().getScopeData();
  if (isolationScope) {
    mergeScopeData(finalScopeData, isolationScope.getScopeData());
  }
  if (scope) {
    mergeScopeData(finalScopeData, scope.getScopeData());
  }
  return finalScopeData;
}
