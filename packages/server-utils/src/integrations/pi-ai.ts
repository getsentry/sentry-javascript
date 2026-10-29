import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, isThenable } from '@sentry/core';
import type { GenAiOptions } from '../ai/core/utils';
import type { PiAiCallKind } from '../ai/pi-ai/chat';
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

const INSTRUMENTED_CHANNELS: { channel: string; kind: PiAiCallKind }[] = [
  { channel: CHANNELS.PI_AI_STREAM, kind: { streaming: true, deferred: false } },
  { channel: CHANNELS.PI_AI_COMPLETE, kind: { streaming: false, deferred: false } },
  { channel: CHANNELS.PI_AI_STREAM_DEFERRED, kind: { streaming: true, deferred: true } },
  { channel: CHANNELS.PI_AI_FETCH_DEFERRED, kind: { streaming: false, deferred: true } },
];

const _piAiIntegration = ((options: PiAiOptions = {}) => {
  return {
    name: PI_AI_INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, piAiModuleNames, instrumentPiAi, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentPiAi(options: PiAiOptions): void {
  // A traced call that makes another one synchronously is one request: `complete` awaits `stream`,
  // and the `compat` functions hand some models to a `Models` of their own. Only the outermost call
  // gets a span. Every traced call publishes `end` synchronously, so the count is back at zero
  // before anything else runs.
  let depth = 0;

  for (const { channel: name, kind } of INSTRUMENTED_CHANNELS) {
    const channel = diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(name);

    bindTracingChannelToSpan(
      channel,
      data => {
        if (depth > 0) {
          return undefined;
        }
        skipPiAiProviderIntegrations();
        return startPiAiChatSpan(data.arguments, kind, options);
      },
      {
        beforeSpanEnd: (span, data) => {
          if (!kind.streaming && !('error' in data)) {
            setPiAiResponseAttributes(span, data.result, options);
          }
        },
        deferSpanEnd: ({ span, data, end }) => {
          if (!kind.streaming || 'error' in data) {
            return false;
          }
          let settled: unknown;
          try {
            settled = (data.result as PiEventStream).result();
          } catch {
            return false;
          }
          // A result of another shape reaches the caller unchanged, and its span ends without a response.
          if (!isThenable(settled)) {
            return false;
          }
          (settled as Promise<unknown>).then(message => {
            setPiAiResponseAttributes(span, message, options);
            end();
          }, end);
          return true;
        },
      },
    );

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
 * is experimental). Subscribes to the `orchestrion:@earendil-works/pi-ai:stream`, `:complete`,
 * `:streamDeferred` and `:fetchDeferred` channels injected into the `Models` methods and the
 * standalone `compat` functions, so it requires the Sentry runtime hook or bundler plugin.
 *
 * Traces one `gen_ai.chat` span per model request, including the requests Flue and pi-durable send.
 * From the first request on, the `openai`, `@anthropic-ai/sdk`, `@google/genai` and Workers AI
 * integrations stop reporting requests in the whole process, because pi-ai sends its requests
 * through those clients.
 */
export const piAiIntegration = defineIntegration(_piAiIntegration);
