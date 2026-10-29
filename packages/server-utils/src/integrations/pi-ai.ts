import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, isThenable } from '@sentry/core';
import type { GenAiOptions } from '../ai/core/utils';
import { setPiAiResponseAttributes, startPiAiChatSpan } from '../ai/pi-ai/chat';
import { PI_AI_INTEGRATION_NAME } from '../ai/pi-ai/constants';
import { skipPiAiProviderIntegrations } from '../ai/pi-ai/providers';
import type { PiEventStream } from '../ai/pi-ai/types';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { piAiModuleNames } from '../orchestrion/config/pi-ai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';

export type PiAiOptions = GenAiOptions;

const _piAiIntegration = ((options: PiAiOptions = {}) => {
  return {
    name: PI_AI_INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, piAiModuleNames, instrumentPiAi, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentPiAi(options: PiAiOptions): void {
  const streamChannel = diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.PI_AI_STREAM);
  const completeChannel = diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.PI_AI_COMPLETE);

  // A traced call that makes another one synchronously is one request: `complete` awaits `stream`,
  // and the `compat` functions hand some models to a `Models` of their own. Only the outermost call
  // gets a span. Every traced call publishes `end` synchronously, so the count is back at zero
  // before anything else runs.
  let depth = 0;
  const startSpan = (data: OrchestrionChannelContext, streaming: boolean) => {
    if (depth > 0) {
      return undefined;
    }
    skipPiAiProviderIntegrations();
    return startPiAiChatSpan(data.arguments, streaming, options);
  };

  bindTracingChannelToSpan(streamChannel, data => startSpan(data, true), {
    // The stream is returned before the request settles; its `result()` settles with the message.
    deferSpanEnd: ({ span, data, end }) => {
      const events = data.result as Partial<PiEventStream> | undefined;
      const settled = 'error' in data || typeof events?.result !== 'function' ? undefined : events.result();
      if (!isThenable(settled)) {
        return false;
      }
      settled.then(message => {
        setPiAiResponseAttributes(span, message, options);
        end();
      }, end);
      return true;
    },
  });

  bindTracingChannelToSpan(completeChannel, data => startSpan(data, false), {
    beforeSpanEnd: (span, data) => {
      if (!('error' in data)) {
        setPiAiResponseAttributes(span, data.result, options);
      }
    },
  });

  for (const channel of [streamChannel, completeChannel]) {
    channel.start.subscribe(() => {
      depth++;
    });
    channel.end.subscribe(() => {
      depth--;
    });
  }
}

/**
 * Diagnostics-channel-based integration for pi-ai (`@earendil-works/pi-ai` >= 0.80.0 < 2, whose API
 * is experimental). Subscribes to the `orchestrion:@earendil-works/pi-ai:stream` and `:complete`
 * channels injected into the `Models` methods and the standalone `compat` functions, so it requires
 * the Sentry runtime hook or bundler plugin.
 *
 * Traces one `gen_ai.chat` span per model request, including the requests Flue and pi-durable send.
 * From the first request on, the `openai`, `@anthropic-ai/sdk`, `@google/genai` and Workers AI
 * integrations stop reporting requests in the whole process, because pi-ai sends its requests
 * through those clients.
 */
export const piAiIntegration = defineIntegration(_piAiIntegration);
