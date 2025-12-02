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
import { safeSetSpanAttributes } from './spanFirstUtils';

/**
 * Captures a span and returns it to the caller, to be enqueued for sending.
 */
export function captureSpan(span: Span, client = getClient()): void {
  if (!client) {
    DEBUG_BUILD && debug.warn('No client available to capture span.');
    return;
  }

  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToV2JSON(segmentSpan);

  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);
  const finalScopeData = getFinalScopeData(spanIsolationScope, spanScope);

  const originalAttributes = serializedSegmentSpan.attributes ?? {};

  applyCommonSpanAttributes(span, serializedSegmentSpan, client, finalScopeData, originalAttributes);

  if (span === segmentSpan) {
    applyScopeToSegmentSpan(span, finalScopeData, originalAttributes);
  }

  // Allow integrations to add additional data to span. Pass in a serialized
  // span to avoid having to potentially serialize the span in every integration
  // (for improved performance).
  client.emit('processSpan', span, { readOnlySpan: spanToV2JSON(span) });

  // Wondering where we apply the beforeSendSpan callback?
  // We apply it directly before sending the span,
  // so whenever the buffer this span gets enqueued in is being flushed.
  // Why? Because we have to enqueue the span instance itself, not a JSON object.
  // We could temporarily convert to JSON here but this means that we'd then again
  // have to mutate the `span` instance (doesn't work for every kind of object mutation)
  // or construct a fully new span object. The latter is risky because users (or we) could hold
  // references to the original span instance.
  client.emit('enqueueSpan', span);
}

function applyScopeToSegmentSpan(
  segmentSpan: Span,
  scopeData: ScopeData,
  originalAttributes: SerializedAttributes,
): void {
  // TODO: Apply all scope data from auto instrumentation (contexts, request) to segment span
  const { attributes } = scopeData;
  if (attributes) {
    safeSetSpanAttributes(segmentSpan, attributes, originalAttributes);
  }
}

function applyCommonSpanAttributes(
  span: Span,
  serializedSegmentSpan: SpanV2JSON,
  client: Client,
  scopeData: ScopeData,
  originalAttributes: SerializedAttributes,
): void {
  const sdk = client.getSdkMetadata();
  const { release, environment, sendDefaultPii } = client.getOptions();

  // avoid overwriting any previously set attributes (from users or potentially our SDK instrumentation)
  safeSetSpanAttributes(
    span,
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
