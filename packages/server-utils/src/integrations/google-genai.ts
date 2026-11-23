import { GEN_AI_REQUEST_MODEL, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  defineIntegration,
  getActiveSpan,
  getClient,
  hasSpanStreamingEnabled,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import { getGenAiSpanOp, markCancelledIfAborted, resolveGenAiCallRecording } from '../ai/core/utils';
import { type GenAiSpanResult, runGenAiSpanEnd, runGenAiSpanStart } from '../ai/core/span-hooks';
import {
  addPrivateRequestAttributes,
  addResponseAttributes,
  extractRequestAttributes,
  getAbortSignal,
  getCallAbortSignal,
  resolveChatParams,
} from '../ai/google-genai';
import { shouldSkipAiProviderSpan } from '../ai/pi-ai/providers';
import { instrumentStream } from '../ai/google-genai/streaming';
import type { GoogleGenAICallInfo, GoogleGenAIOptions, GoogleGenAIResponse } from '../ai/google-genai/types';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { googleGenAiModuleNames } from '../orchestrion/config/google-genai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

// Same name as the OTel integration by design, so the OTel 'Google_GenAI'
// integration is deduplicated out of the default set.
const INTEGRATION_NAME = 'Google_GenAI' as const;

const ORIGIN = 'auto.ai.google_genai';

// The recording decision is made once, when the span starts, in the caller's async context.
type GoogleGenAIChannelContext = OrchestrionChannelContext & {
  _sentryRecordOutputs?: boolean;
  _sentryOnSpanEnd?: (result: GenAiSpanResult<unknown>) => void;
};

// Each instrumented method maps to the gen_ai operation its span reports.
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.GOOGLE_GENAI_GENERATE_CONTENT, operation: 'generate_content' },
  { channel: CHANNELS.GOOGLE_GENAI_EMBED_CONTENT, operation: 'embeddings' },
  { channel: CHANNELS.GOOGLE_GENAI_CHAT, operation: 'chat' },
  { channel: CHANNELS.GOOGLE_GENAI_DECIDE, operation: 'decide' },
] as const;

const _googleGenAIIntegration = ((options: GoogleGenAIOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, googleGenAiModuleNames, instrumentGoogleGenai, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentGoogleGenai(options: GoogleGenAIOptions): void {
  for (const { channel, operation } of INSTRUMENTED_CHANNELS) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<GoogleGenAIChannelContext>(channel),
      data => createGenAiSpan(data, operation, options),
      {
        beforeSpanEnd: (span, data) => {
          if ('error' in data) {
            const params = resolveChatParams(
              operation,
              data.arguments?.[0] as Record<string, unknown> | undefined,
              data.self,
            );
            markCancelledIfAborted(span, getCallAbortSignal(operation, params, data.arguments?.[1]));
          }
          // Embeddings responses carry no content attributes.
          if (operation !== 'embeddings') {
            addResponseAttributes(span, data.result as GoogleGenAIResponse, !!data._sentryRecordOutputs, operation);
          }
          data._sentryOnSpanEnd?.('error' in data ? { error: data.error } : { response: data.result });
        },
        deferSpanEnd: ({ span, data }) => wrapStreamResult(span, data, operation),
      },
    );
  }
}

/**
 * Build the span for an instrumented call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(
  data: GoogleGenAIChannelContext,
  operation: string,
  options: GoogleGenAIOptions,
): Span | undefined {
  if (shouldSkipAiProviderSpan(INTEGRATION_NAME)) {
    return undefined;
  }

  // `chat.sendMessage()`/`sendMessageStream()` internally call `Models.generateContent(Stream)`, which
  // publishes the `generate-content` channel while the chat span is active. Skip that nested event so a
  // chat call yields a single `gen_ai.chat` span instead of a chat span wrapping a generate_content one.
  if (operation !== 'chat') {
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const {
        attributes: { [SENTRY_OP]: op, [SENTRY_ORIGIN]: origin },
      } = spanToJSON(activeSpan);
      if (origin === ORIGIN && op === 'gen_ai.chat') {
        return undefined;
      }
    }
  }

  const args = data.arguments ?? [];
  // `chat.sendMessage()` carries no config of its own unless the caller passes one, so recover the
  // one `chats.create()` left on the chat instance that the transform stashed in `data.self`.
  const request = args[0] as Record<string, unknown> | undefined;
  const params = resolveChatParams(operation, request, data.self);

  const call: GoogleGenAICallInfo = { operation, request };
  const { recordInputs, recordOutputs } = resolveGenAiCallRecording(options, call);
  data._sentryRecordOutputs = recordOutputs;

  const attributes = extractRequestAttributes(operation, params, data.self, recordInputs);
  const model = (attributes[GEN_AI_REQUEST_MODEL] as string) || 'unknown';
  attributes[SENTRY_ORIGIN] = ORIGIN;
  const client = getClient();

  const span = startInactiveSpan({
    // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
    name: model !== 'unknown' || !(client && hasSpanStreamingEnabled(client)) ? `${operation} ${model}` : operation,
    op: getGenAiSpanOp(operation),
    attributes,
  });

  if (recordInputs && params) {
    addPrivateRequestAttributes(span, params, operation);
  }

  runGenAiSpanStart(options, span, call);
  data._sentryOnSpanEnd = result => runGenAiSpanEnd(options, span, call, result);

  return span;
}

type AsyncIterableStream = { [Symbol.asyncIterator]: () => AsyncIterator<unknown> };

function isAsyncIterable(value: unknown): value is AsyncIterableStream {
  return !!value && typeof (value as AsyncIterableStream)[Symbol.asyncIterator] === 'function';
}

/**
 * Only the streaming methods (`generateContentStream`/`sendMessageStream`) resolve to an async iterable.
 * For a stream we patch `result[Symbol.asyncIterator]` in place so `instrumentStream` ends the
 * span when iteration finishes.
 */
function wrapStreamResult(span: Span, data: GoogleGenAIChannelContext, operation: string): boolean {
  const result = data.result;
  if (!isAsyncIterable(result)) {
    return false;
  }

  const iterate = result[Symbol.asyncIterator].bind(result);
  const params = resolveChatParams(operation, data.arguments?.[0] as Record<string, unknown> | undefined, data.self);
  const instrumented = instrumentStream(
    { [Symbol.asyncIterator]: iterate },
    span,
    !!data._sentryRecordOutputs,
    getAbortSignal(params),
    data._sentryOnSpanEnd,
  );
  result[Symbol.asyncIterator] = () => instrumented;

  return true;
}

/**
 * Diagnostics-channel-based Google GenAI integration. Subscribes to the
 * `orchestrion:@google/genai:*` diagnostics_channels injected into the SDK's `Models`
 * (`generateContent`/`generateContentStream`/`embedContent`), `Chat`
 * (`sendMessage`/`sendMessageStream`) and decisions (`create`) methods, so it requires the Sentry
 * runtime hook or bundler plugin.
 */
export const googleGenAIIntegration = defineIntegration(_googleGenAIIntegration);
