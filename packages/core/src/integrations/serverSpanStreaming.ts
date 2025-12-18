import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { captureSpan } from '../spans/captureSpan';
import { SpanBuffer } from '../spans/spanBuffer';
import type { IntegrationFn } from '../types-hoist/integration';
import { isV2BeforeSendSpanCallback } from '../utils/beforeSendSpan';
import { debug } from '../utils/debug-logger';

export interface ServerSpanStreamingOptions {
  /** Max spans per envelope batch (default: 1000) */
  maxSpanLimit?: number;
  /** Flush interval in ms (default: 5000) */
  flushInterval?: number;
}

const INTEGRATION_NAME = 'ServerSpanStreaming';

const _serverSpanStreamingIntegration = ((options?: ServerSpanStreamingOptions) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const clientOptions = client.getOptions();
      const beforeSendSpan = clientOptions.beforeSendSpan;

      const initialMessage = 'serverSpanStreamingIntegration requires';
      const fallbackMsg = 'Falling back to static trace lifecycle.';

      if (clientOptions.traceLifecycle !== 'stream') {
        client.getOptions().traceLifecycle = 'static';
        DEBUG_BUILD && debug.warn(`${initialMessage} \`traceLifecycle\` to be set to "stream"! ${fallbackMsg}`);
        return;
      }

      if (beforeSendSpan && !isV2BeforeSendSpanCallback(beforeSendSpan)) {
        client.getOptions().traceLifecycle = 'static';
        DEBUG_BUILD &&
          debug.warn(`${initialMessage} a beforeSendSpan callback using \`withStreamSpan\`! ${fallbackMsg}`);
        return;
      }

      const buffer = new SpanBuffer(client, options);

      client.on('enqueueSpan', spanJSON => {
        buffer.addSpan(spanJSON);
      });

      client.on('afterSpanEnd', span => {
        captureSpan(span, client);
      });
    },
  };
}) satisfies IntegrationFn;

export const serverSpanStreamingIntegration = defineIntegration(_serverSpanStreamingIntegration);
