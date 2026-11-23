import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, Span } from '@sentry/core';
import { defineIntegration, isThenable, startInactiveSpan } from '@sentry/core';
import type { GenAiSpanHooks, GenAiSpanResult } from '../ai/core/span-hooks';
import { runGenAiSpanEnd, runGenAiSpanStart } from '../ai/core/span-hooks';
import type { GenAiCallOptions } from '../ai/core/utils';
import { getPiAiChatSpanOptions, observePiAiFirstChunk, setPiAiResponseAttributes } from '../ai/pi-ai/chat';
import { PI_AI_INTEGRATION_NAME } from '../ai/pi-ai/constants';
import type { PiAiContext } from '../ai/pi-ai/messages';
import { isInsidePiAiSpan } from '../ai/pi-ai/providers';
import { getPiAiDriver, resolvePiAiRecordingOptions } from '../ai/pi-ai/recording';
import type { PiAiCallInfo, PiAssistantMessage, PiEventStream, PiModel, PiStreamOptions } from '../ai/pi-ai/types';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { piAiModuleNames } from '../orchestrion/config/pi-ai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';

/** `onSpanEnd` gets the `AssistantMessage` the request settled with, for `stream` and `complete` alike. */
export type PiAiOptions = GenAiCallOptions<PiAiCallInfo> & GenAiSpanHooks<PiAiCallInfo, PiAssistantMessage>;

type PiAiChannelContext = OrchestrionChannelContext & {
  _sentryRecordOutputs?: boolean;
  /** The message a stream's `result()` settled with. */
  _sentryMessage?: unknown;
  _sentryOnSpanEnd?: (result: GenAiSpanResult<PiAssistantMessage>) => void;
};

const _piAiIntegration = ((options: PiAiOptions = {}) => {
  return {
    name: PI_AI_INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, piAiModuleNames, instrumentPiAi, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentPiAi(options: PiAiOptions): void {
  const streamChannel = diagnosticsChannel.tracingChannel<PiAiChannelContext>(CHANNELS.PI_AI_STREAM);
  const completeChannel = diagnosticsChannel.tracingChannel<PiAiChannelContext>(CHANNELS.PI_AI_COMPLETE);

  const startSpan = (data: PiAiChannelContext, streaming: boolean): Span | undefined => {
    // `complete` awaits `stream`, and the `compat` functions hand some models to a `Models` of their
    // own, so a traced call can make another one. Only the outermost gets a span.
    if (isInsidePiAiSpan()) {
      return undefined;
    }
    const [model, context, callOptions] = (data.arguments ?? []) as [
      PiModel | undefined,
      PiAiCallInfo['context'],
      PiStreamOptions | undefined,
    ];
    const call: PiAiCallInfo = { model, context, options: callOptions };
    // Flue and pi-durable put their own options on the scope of the requests they send.
    const driver = getPiAiDriver();
    const { recordInputs, recordOutputs } = resolvePiAiRecordingOptions(options, call, driver);
    data._sentryRecordOutputs = recordOutputs;
    const span = startInactiveSpan(
      getPiAiChatSpanOptions({
        model: model ?? {},
        // The deferred calls pass a handle here, which carries no request content.
        context: context as PiAiContext | undefined,
        callOptions,
        streaming,
        recordInputs,
      }),
    );
    runGenAiSpanStart(options, span, call);
    driver?.onSpanStart(span);
    data._sentryOnSpanEnd = result => {
      runGenAiSpanEnd(options, span, call, result);
      driver?.onSpanEnd(span, result);
    };
    return span;
  };

  const beforeSpanEnd = (span: Span, data: PiAiChannelContext, message: unknown): void => {
    if ('error' in data) {
      data._sentryOnSpanEnd?.({ error: data.error });
      return;
    }
    if (message && typeof message === 'object') {
      setPiAiResponseAttributes(span, message, !!data._sentryRecordOutputs);
    }
    data._sentryOnSpanEnd?.({ response: message as PiAssistantMessage | undefined });
  };

  bindTracingChannelToSpan(streamChannel, data => startSpan(data, true), {
    // The stream is returned before the request settles; its `result()` settles with the message.
    deferSpanEnd: ({ span, data, end }) => {
      const events = data.result as Partial<PiEventStream> | undefined;
      const settled = 'error' in data || typeof events?.result !== 'function' ? undefined : events.result();
      if (!isThenable(settled)) {
        return false;
      }
      observePiAiFirstChunk(span, events);
      settled.then(message => {
        data._sentryMessage = message;
        end();
      }, end);
      return true;
    },
    beforeSpanEnd: (span, data) => beforeSpanEnd(span, data, data._sentryMessage),
  });

  bindTracingChannelToSpan(completeChannel, data => startSpan(data, false), {
    beforeSpanEnd: (span, data) => beforeSpanEnd(span, data, data.result),
  });
}

/**
 * Traces the requests sent with pi-ai (`@earendil-works/pi-ai` >= 0.80.0 < 2) as `gen_ai.chat` spans,
 * through `createModels()` or the standalone `stream` and `complete` functions. Needs the Sentry
 * runtime hook (`--import`) or bundler plugin. This includes the model calls of Flue and pi-durable
 * agents, which send them through pi-ai.
 *
 * @example
 * ```javascript
 * Sentry.init({
 *   integrations: [Sentry.piAiIntegration({ recordInputs: true, recordOutputs: true })],
 * });
 * ```
 */
export const piAiIntegration = defineIntegration(_piAiIntegration);
