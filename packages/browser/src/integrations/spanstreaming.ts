import type { Client, IntegrationFn, Span, SpanV2JSON } from '@sentry/core';
import {
  captureSpan,
  createSpanV2Envelope,
  debug,
  defineIntegration,
  getDynamicSamplingContextFromSpan,
  INTERNAL_getSegmentSpan,
  isV2BeforeSendSpanCallback,
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
    ...userOptions,
    batchLimit:
      userOptions?.batchLimit && userOptions.batchLimit <= 1000 && userOptions.batchLimit >= 1
        ? userOptions.batchLimit
        : 1000,
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

      if (clientOptions.traceLifecycle !== 'stream') {
        DEBUG_BUILD && debug.warn(`${initialMessage} \`traceLifecycle\` to be set to "stream"! ${fallbackMsg}`);
        return;
      }

      if (beforeSendSpan && !isV2BeforeSendSpanCallback(beforeSendSpan)) {
        client.getOptions().traceLifecycle = 'static';
        debug.warn(`${initialMessage} a beforeSendSpan callback using \`withStreamSpan\`! ${fallbackMsg}`);
        return;
      }

      client.on('enqueueSpan', span => {
        const spanTreeMapKey = getSpanTreeMapKey(span);
        const spanBuffer = spanTreeMap.get(spanTreeMapKey);
        if (spanBuffer) {
          spanBuffer.add(span);
        } else {
          spanTreeMap.set(spanTreeMapKey, new Set([span]));
        }
      });

      client.on('afterSpanEnd', span => {
        captureSpan(span, client);
      });

      // For now, we send all spans on local segment (root) span end.
      // TODO: This will change once we have more concrete ideas about a universal SDK data buffer.
      client.on('afterSegmentSpanEnd', segmentSpan => {
        sendSegment(segmentSpan, {
          spanTreeMap: spanTreeMap,
          client,
          batchLimit: options.batchLimit,
          beforeSendSpan,
        });
      });
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
  return `${span.spanContext().traceId}-${INTERNAL_getSegmentSpan(span).spanContext().spanId}`;
}

function sendSegment(
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

  const finalSpans = Array.from(spansOfTrace).map(span => {
    const spanJson = spanToV2JSON(span);
    if (beforeSendSpan) {
      return applyBeforeSendSpanCallback(spanJson, beforeSendSpan);
    }
    return spanJson;
  });

  const batches: SpanV2JSON[][] = [];
  for (let i = 0; i < finalSpans.length; i += batchLimit) {
    batches.push(finalSpans.slice(i, i + batchLimit));
  }

  DEBUG_BUILD && debug.log(`Sending trace ${traceId} in ${batches.length} batch${batches.length === 1 ? '' : 'es'}`);

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

function applyBeforeSendSpanCallback(span: SpanV2JSON, beforeSendSpan: (span: SpanV2JSON) => SpanV2JSON): SpanV2JSON {
  const modifedSpan = beforeSendSpan(span);
  if (!modifedSpan) {
    showSpanDropWarning();
    return span;
  }
  return modifedSpan;
}
