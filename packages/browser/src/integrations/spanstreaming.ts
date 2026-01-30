import type { IntegrationFn } from '@sentry/core';
import {
  captureSpan,
  debug,
  defineIntegration,
  isV2BeforeSendSpanCallback,
  safeSetSpanJSONAttributes,
  SpanBuffer,
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

  let sdkConfigured = false;

  return {
    name: 'SpanStreaming',
    beforeSetup(client) {
      const clientOptions = client.getOptions();
      if (!clientOptions.traceLifecycle) {
        client.getOptions().traceLifecycle = 'stream';
      }

      const initialMessage = 'spanStreamingIntegration requires';
      const fallbackMsg = 'Falling back to static trace lifecycle.';

      if (!clientOptions.traceLifecycle) {
        // For browser, we auto-enable span streaming already if this integration is enabled
        // This avoids requiring users to manually opt into span streaming via 2 mechanisms
        // so we set `traceLifecycle` to `stream` if it's not set.
        client.getOptions().traceLifecycle = 'stream';
      }

      if (clientOptions.traceLifecycle !== 'stream') {
        // If there's a conflict between this integration being added and `traceLifecycle` being set to `static`
        // we prefer static (non-span-streaming) mode.
        DEBUG_BUILD &&
          debug.warn(
            `${initialMessage} \`traceLifecycle\` is set to ${clientOptions.traceLifecycle}. ${fallbackMsg}. Either remove \`spanStreamingIntegration\` or set \`traceLifecycle\` to "stream".`,
          );
        return;
      }

      const beforeSendSpan = clientOptions.beforeSendSpan;
      if (beforeSendSpan && !isV2BeforeSendSpanCallback(beforeSendSpan)) {
        client.getOptions().traceLifecycle = 'static';
        debug.warn(`${initialMessage} a beforeSendSpan callback using \`withStreamSpan\`! ${fallbackMsg}`);
        return;
      }

      sdkConfigured = true;
    },
    setup(client) {
      if (!sdkConfigured) {
        // options validation failed in beforeSetup, so we don't do anything here
        return;
      }

      const buffer = new SpanBuffer(client);

      client.on('enqueueSpan', spanJSON => {
        buffer.addSpan(spanJSON);
      });

      client.on('afterSpanEnd', span => {
        captureSpan(span, client);
      });

      client.on('processSpan', spanJSON => {
        safeSetSpanJSONAttributes(spanJSON, {
          // browser-only: tell Sentry to infer the IP address from the request
          'client.address': client.getOptions().sendDefaultPii ? '{{auto}}' : undefined,
        });
      });

      // in addition to capturing the span, we also flush the trace when the segment
      // span ends to ensure things are sent timely. We never know when the browser
      // is closed, users navigate away, etc.
      client.on('afterSegmentSpanEnd', segmentSpan => buffer.flushTrace(segmentSpan.spanContext().traceId));
    },
  };
}) satisfies IntegrationFn);
