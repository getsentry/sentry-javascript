import type { Client, IntegrationFn, Span, SpanAttributes, SpanAttributeValue, SpanV2JSON } from '@sentry/core';
import {
  createSpanV2Envelope,
  debug,
  defineIntegration,
  getCapturedScopesOnSpan,
  getDynamicSamplingContextFromSpan,
  getGlobalScope,
  getRootSpan as getSegmentSpan,
  isV2BeforeSendSpanCallback,
  mergeScopeData,
  reparentChildSpans,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
  shouldIgnoreSpan,
  showSpanDropWarning,
  spanToV2JSON,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

export interface SpanStreamingOptions {
  batchLimit: number;
}

export const spanStreamingIntegration = defineIntegration(((userOptions?: Partial<SpanStreamingOptions>) => {
  const validatedUserProvidedBatchLimit =
    userOptions?.batchLimit && userOptions.batchLimit <= 1000 && userOptions.batchLimit >= 1
      ? userOptions.batchLimit
      : undefined;

  if (DEBUG_BUILD && userOptions?.batchLimit && !validatedUserProvidedBatchLimit) {
    debug.warn('SpanStreaming batchLimit must be between 1 and 1000, defaulting to 1000');
  }

  const options: SpanStreamingOptions = {
    batchLimit:
      userOptions?.batchLimit && userOptions.batchLimit <= 1000 && userOptions.batchLimit >= 1
        ? userOptions.batchLimit
        : 1000,
    ...userOptions,
  };

  // key: traceId-segmentSpanId
  const spanTreeMap = new Map<string, Set<Span>>();

  return {
    name: 'SpanStreaming',
    setup(client) {
      const clientOptions = client.getOptions();
      const beforeSendSpan = clientOptions.beforeSendSpan;

      const initialMessage = 'spanStreamingIntegration requires';
      const fallbackMsg = 'Falling back to static trace lifecycle.';

      if (clientOptions.traceLifecycle !== 'streamed') {
        DEBUG_BUILD && debug.warn(`${initialMessage} \`traceLifecycle\` to be set to "streamed"! ${fallbackMsg}`);
        return;
      }

      if (beforeSendSpan && !isV2BeforeSendSpanCallback(beforeSendSpan)) {
        DEBUG_BUILD &&
          debug.warn(`${initialMessage} a beforeSendSpan callback using \`makeV2Callback\`! ${fallbackMsg}`);
        return;
      }

      client.on('spanEnd', span => {
        const spanTreeMapKey = getSpanTreeMapKey(span);
        const spanBuffer = spanTreeMap.get(spanTreeMapKey);
        if (spanBuffer) {
          spanBuffer.add(span);
        } else {
          spanTreeMap.set(spanTreeMapKey, new Set([span]));
        }
      });

      // For now, we send all spans on local segment (root) span end.
      // TODO: This will change once we have more concrete ideas about a universal SDK data buffer.
      client.on(
        'segmentSpanEnd',
        segmentSpan => () =>
          processAndSendSpans(segmentSpan, {
            spanTreeMap: spanTreeMap,
            client,
            batchLimit: options.batchLimit,
            beforeSendSpan,
          }),
      );
    },
  };
}) satisfies IntegrationFn);

interface SpanProcessingOptions {
  client: Client;
  spanTreeMap: Map<string, Set<Span>>;
  batchLimit: number;
  beforeSendSpan: ((span: SpanV2JSON) => SpanV2JSON) | undefined;
}

/**
 * Just the traceid alone isn't enough because there can be multiple span trees with the same traceid.
 */
function getSpanTreeMapKey(span: Span): string {
  return `${span.spanContext().traceId}-${getSegmentSpan(span).spanContext().spanId}`;
}

function processAndSendSpans(
  segmentSpan: Span,
  { client, spanTreeMap, batchLimit, beforeSendSpan }: SpanProcessingOptions,
): void {
  const traceId = segmentSpan.spanContext().traceId;
  const spanTreeMapKey = getSpanTreeMapKey(segmentSpan);
  const spansOfTrace = spanTreeMap.get(spanTreeMapKey);

  if (!spansOfTrace?.size) {
    spanTreeMap.delete(spanTreeMapKey);
    return;
  }
  const segmentSpanJson = spanToV2JSON(segmentSpan);

  for (const span of spansOfTrace) {
    applyCommonSpanAttributes(span, segmentSpanJson, client);
  }

  // TODO: Apply scope data and contexts to segment span

  const { ignoreSpans } = client.getOptions();

  // 1. Check if the entire span tree is ignored by ignoreSpans
  if (ignoreSpans?.length && shouldIgnoreSpan(segmentSpanJson, ignoreSpans)) {
    client.recordDroppedEvent('before_send', 'span', spansOfTrace.size);
    spanTreeMap.delete(spanTreeMapKey);
    return;
  }

  const serializedSpans = Array.from(spansOfTrace ?? []).map(spanToV2JSON);

  const processedSpans = [];
  let ignoredSpanCount = 0;

  for (const span of serializedSpans) {
    // 2. Check if child spans should be ignored
    const isChildSpan = span.span_id !== segmentSpan.spanContext().spanId;
    if (ignoreSpans?.length && isChildSpan && shouldIgnoreSpan(span, ignoreSpans)) {
      reparentChildSpans(serializedSpans, span);
      ignoredSpanCount++;
      // drop this span by not adding it to the processedSpans array
      continue;
    }

    // 3. Apply beforeSendSpan callback
    const processedSpan = beforeSendSpan ? applyBeforeSendSpanCallback(span, beforeSendSpan) : span;
    processedSpans.push(processedSpan);
  }

  if (ignoredSpanCount) {
    client.recordDroppedEvent('before_send', 'span', ignoredSpanCount);
  }

  const batches: SpanV2JSON[][] = [];
  for (let i = 0; i < processedSpans.length; i += batchLimit) {
    batches.push(processedSpans.slice(i, i + batchLimit));
  }

  DEBUG_BUILD && debug.log(`Sending trace ${traceId} in ${batches.length} batche${batches.length === 1 ? '' : 's'}`);

  const dsc = getDynamicSamplingContextFromSpan(segmentSpan);

  for (const batch of batches) {
    const envelope = createSpanV2Envelope(batch, dsc, client);
    // no need to handle client reports for network errors,
    // buffer overflows or rate limiting here. All of this is handled
    // by client and transport.
    client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending span stream envelope:', reason);
    });
  }

  spanTreeMap.delete(spanTreeMapKey);
}

function applyCommonSpanAttributes(span: Span, serializedSegmentSpan: SpanV2JSON, client: Client): void {
  const sdk = client.getSdkMetadata();
  const { release, environment, sendDefaultPii } = client.getOptions();

  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);

  const originalAttributeKeys = Object.keys(spanToV2JSON(span).attributes ?? {});

  // TODO: Extract this scope data merge to a helper in core. It's used in multiple places.
  const finalScopeData = getGlobalScope().getScopeData();
  if (spanIsolationScope) {
    mergeScopeData(finalScopeData, spanIsolationScope.getScopeData());
  }
  if (spanScope) {
    mergeScopeData(finalScopeData, spanScope.getScopeData());
  }

  // avoid overwriting any previously set attributes (from users or potentially our SDK instrumentation)
  setAttributesIfNotPresent(span, originalAttributeKeys, {
    [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: release,
    [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: environment,
    [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: serializedSegmentSpan.name,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: sdk?.sdk?.name,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: sdk?.sdk?.version,
    ...(sendDefaultPii
      ? {
          [SEMANTIC_ATTRIBUTE_USER_ID]: finalScopeData.user?.id,
          [SEMANTIC_ATTRIBUTE_USER_EMAIL]: finalScopeData.user?.email,
          [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: finalScopeData.user?.ip_address ?? undefined,
          [SEMANTIC_ATTRIBUTE_USER_USERNAME]: finalScopeData.user?.username,
        }
      : {}),
  });
}

function applyBeforeSendSpanCallback(span: SpanV2JSON, beforeSendSpan: (span: SpanV2JSON) => SpanV2JSON): SpanV2JSON {
  const modifedSpan = beforeSendSpan(span);
  if (!modifedSpan) {
    showSpanDropWarning();
    return span;
  }
  return modifedSpan;
}

function setAttributesIfNotPresent(span: Span, originalAttributeKeys: string[], newAttributes: SpanAttributes): void {
  Object.keys(newAttributes).forEach(key => {
    if (!originalAttributeKeys.includes(key)) {
      span.setAttribute(key, newAttributes[key]);
    }
  });
}
