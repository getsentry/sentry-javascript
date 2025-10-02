import type { IntegrationFn, Span, SpanV2JSON } from '@sentry/core';
import {
  createSpanV2Envelope,
  debug,
  defineIntegration,
  getDynamicSamplingContextFromSpan,
  isV2BeforeSendSpanCallback,
  spanToV2JSON,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

export interface SpanStreamingOptions {
  batchLimit: number;
}

const _spanStreamingIntegration = ((userOptions?: Partial<SpanStreamingOptions>) => {
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

  const traceMap = new Map<string, Set<Span>>();

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
        const spanBuffer = traceMap.get(span.spanContext().traceId);
        if (spanBuffer) {
          spanBuffer.add(span);
        } else {
          traceMap.set(span.spanContext().traceId, new Set([span]));
        }
      });

      // For now, we send all spans on local segment (root) span end.
      // TODO: This will change once we have more concrete ideas about a universal SDK data buffer.
      client.on('segmentSpanEnd', segmentSpan => {
        const traceId = segmentSpan.spanContext().traceId;
        const spansOfTrace = traceMap.get(traceId);

        if (!spansOfTrace?.size) {
          traceMap.delete(traceId);
          return;
        }

        const serializedSpans = Array.from(spansOfTrace ?? []).map(span => {
          const serializedSpan = spanToV2JSON(span);
          return beforeSendSpan ? beforeSendSpan(serializedSpan) : serializedSpan;
        });

        const batches: SpanV2JSON[][] = [];
        for (let i = 0; i < serializedSpans.length; i += options.batchLimit) {
          batches.push(serializedSpans.slice(i, i + options.batchLimit));
        }

        DEBUG_BUILD &&
          debug.log(`Sending trace ${traceId} in ${batches.length} batche${batches.length === 1 ? '' : 's'}`);

        // TODO: Apply scopes to spans
        // TODO: Apply ignoreSpans to spans

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

        traceMap.delete(traceId);
      });
    },
  };
}) satisfies IntegrationFn;

export const spanStreamingIntegration = defineIntegration(_spanStreamingIntegration);
