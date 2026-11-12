import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, Span } from '@sentry/core';
import { defineIntegration, isThenable, startInactiveSpan } from '@sentry/core';
import type { GenAiOptions } from '../ai/core/utils';
import { resolveAIRecordingOptions } from '../ai/core/utils';
import { getPiAiChatSpanOptions, setPiAiResponseAttributes } from '../ai/pi-ai/chat';
import { PI_AI_INTEGRATION_NAME, PI_AI_ORIGIN } from '../ai/pi-ai/constants';
import type { PiAiContext } from '../ai/pi-ai/messages';
import { skipPiAiProviderIntegrations } from '../ai/pi-ai/providers';
import type { PiEventStream, PiStreamOptions } from '../ai/pi-ai/types';
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

  // `complete` awaits `stream`, and the `compat` functions hand some models to a `Models` of their
  // own, so a traced call can make another one synchronously. Only the outermost gets a span.
  let depth = 0;
  const startSpan = (data: OrchestrionChannelContext, streaming: boolean): Span | undefined => {
    if (depth > 0) {
      return undefined;
    }
    skipPiAiProviderIntegrations();
    const [model, context, callOptions] = data.arguments ?? [];
    return startInactiveSpan(
      getPiAiChatSpanOptions({
        model: model ?? {},
        // The deferred calls pass a handle here, which carries no request content.
        context: context as PiAiContext | undefined,
        callOptions: callOptions as PiStreamOptions | undefined,
        streaming,
        origin: PI_AI_ORIGIN,
        recordInputs: resolveAIRecordingOptions(options).recordInputs,
      }),
    );
  };

  const setResponse = (span: Span, message: unknown): void => {
    if (message && typeof message === 'object') {
      setPiAiResponseAttributes(span, message, resolveAIRecordingOptions(options).recordOutputs);
    }
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
        setResponse(span, message);
        end();
      }, end);
      return true;
    },
  });

  bindTracingChannelToSpan(completeChannel, data => startSpan(data, false), {
    beforeSpanEnd: (span, data) => {
      if (!('error' in data)) {
        setResponse(span, data.result);
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
 * Traces the requests sent with pi-ai (`@earendil-works/pi-ai` >= 0.80.0 < 2) as `gen_ai.chat` spans,
 * through `createModels()` or the standalone `stream` and `complete` functions. Needs the Sentry
 * runtime hook (`--import`) or bundler plugin.
 *
 * Not enabled by default yet. Flue and pi-durable send their model calls through pi-ai and still
 * report them as chat spans of their own, so enabling this alongside them reports each call twice.
 *
 * Once pi-ai has sent a request, the `openai`, `@anthropic-ai/sdk`, `@google/genai` and Workers AI
 * integrations stop recording requests for the rest of the process, since pi-ai sends through them.
 *
 * @example
 * ```javascript
 * Sentry.init({
 *   integrations: [Sentry.piAiIntegration()],
 * });
 * ```
 */
export const piAiIntegration = defineIntegration(_piAiIntegration);
