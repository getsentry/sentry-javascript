import { GEN_AI_REQUEST_MODEL, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  defineIntegration,
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToStreamedSpanJSON,
  startInactiveSpan,
} from '@sentry/core';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../../ai/core/utils';
import { addPrivateRequestAttributes, addResponseAttributes, extractRequestAttributes } from '../../ai/google-genai';
import { instrumentStream } from '../../ai/google-genai/streaming';
import type { GoogleGenAIOptions, GoogleGenAIResponse } from '../../ai/google-genai/types';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import { googleGenAiModuleNames } from '../../orchestrion/config/google-genai';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';

// Same name as the OTel integration by design, so the OTel 'Google_GenAI'
// integration is deduplicated out of the default set.
const INTEGRATION_NAME = 'Google_GenAI' as const;

const ORIGIN = 'auto.ai.google_genai';

// Each instrumented method maps to the gen_ai operation its span reports.
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.GOOGLE_GENAI_GENERATE_CONTENT, operation: 'generate_content' },
  { channel: CHANNELS.GOOGLE_GENAI_EMBED_CONTENT, operation: 'embeddings' },
  { channel: CHANNELS.GOOGLE_GENAI_CHAT, operation: 'chat' },
] as const;

interface GoogleGenAIChannelContext {
  arguments: unknown[];
  // The transform stashes the call's `this` here, which chat methods need since the model lives on
  // the `Chat` instance (`this.model`/`this.modelVersion`), not in the call arguments.
  self?: unknown;
  result?: unknown;
}

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
          // Embeddings responses carry no content attributes.
          if (operation !== 'embeddings') {
            addResponseAttributes(
              span,
              data.result as GoogleGenAIResponse,
              resolveAIRecordingOptions(options).recordOutputs,
            );
          }
        },
        deferSpanEnd: ({ span, data }) => wrapStreamResult(span, data, options),
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
  // When another provider (e.g. LangChain) is driving the SDK, it records the spans itself and marks this
  // provider as skipped; skip here to avoid double spans.
  if (_INTERNAL_shouldSkipAiProviderWrapping(INTEGRATION_NAME)) {
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
      } = spanToStreamedSpanJSON(activeSpan);
      if (origin === ORIGIN && op === 'gen_ai.chat') {
        return undefined;
      }
    }
  }

  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);

  const attributes = extractRequestAttributes(operation, params, data.self);
  const model = (attributes[GEN_AI_REQUEST_MODEL] as string) || 'unknown';
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;

  const span = startInactiveSpan({
    name: `${operation} ${model}`,
    op: getGenAiSpanOp(operation),
    attributes,
  });

  if (recordInputs && params) {
    addPrivateRequestAttributes(span, params, operation);
  }

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
function wrapStreamResult(span: Span, data: GoogleGenAIChannelContext, options: GoogleGenAIOptions): boolean {
  const result = data.result;
  if (!isAsyncIterable(result)) {
    return false;
  }

  const { recordOutputs } = resolveAIRecordingOptions(options);
  const iterate = result[Symbol.asyncIterator].bind(result);
  const instrumented = instrumentStream({ [Symbol.asyncIterator]: iterate }, span, recordOutputs ?? false);
  result[Symbol.asyncIterator] = () => instrumented;

  return true;
}

/**
 * Orchestrion-driven Google GenAI integration. Subscribes to the
 * `orchestrion:@google/genai:*` diagnostics_channels injected into the SDK's `Models`
 * (`generateContent`/`generateContentStream`/`embedContent`) and `Chat`
 * (`sendMessage`/`sendMessageStream`) methods, so it requires the orchestrion runtime hook or
 * bundler plugin.
 */
export const googleGenAIIntegration = defineIntegration(_googleGenAIIntegration);
