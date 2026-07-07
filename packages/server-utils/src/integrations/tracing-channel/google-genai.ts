import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { GoogleGenAIOptions, GoogleGenAIResponse, IntegrationFn, Span } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  addGoogleGenAIRequestAttributes,
  addGoogleGenAIResponseAttributes,
  debug,
  defineIntegration,
  extractGoogleGenAIRequestAttributes,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  getActiveSpan,
  instrumentGoogleGenAIStream,
  resolveAIRecordingOptions,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  shouldEnableTruncation,
  spanToJSON,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel integration by design: when enabled, the OTel 'Google_GenAI'
// integration is dropped from the default set (see the Node opt-in loader).
const INTEGRATION_NAME = 'Google_GenAI' as const;

// Distinct from the proxy's `auto.ai.google_genai` so spans from the orchestrion path
// are attributable separately from the OTel/proxy one.
const ORIGIN = 'auto.ai.orchestrion.google_genai';

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

let subscribed = false;

const _googleGenAIChannelIntegration = ((options: GoogleGenAIOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19, and a second `init()` would double-subscribe.
      if (!diagnosticsChannel.tracingChannel || subscribed) {
        return;
      }
      subscribed = true;

      // `bindTracingChannelToSpan` needs the async-context binding that `initOpenTelemetry()` registers
      // after `setupOnce` runs, so wait for it before subscribing.
      waitForTracingChannelBinding(() => {
        for (const { channel, operation } of INSTRUMENTED_CHANNELS) {
          DEBUG_BUILD && debug.log(`[orchestrion:google-genai] subscribing to channel "${channel}"`);
          bindTracingChannelToSpan(
            diagnosticsChannel.tracingChannel<GoogleGenAIChannelContext>(channel),
            data => createGenAiSpan(data, operation, options),
            {
              beforeSpanEnd: (span, data) => {
                // Embeddings responses carry no content attributes.
                if (operation !== 'embeddings') {
                  addGoogleGenAIResponseAttributes(
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
      });
    },
  };
}) satisfies IntegrationFn;

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
      const { op, origin } = spanToJSON(activeSpan);
      if (origin === ORIGIN && op === 'gen_ai.chat') {
        return undefined;
      }
    }
  }

  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);
  const enableTruncation = shouldEnableTruncation(options.enableTruncation);

  const attributes = extractGoogleGenAIRequestAttributes(operation, params, data.self);
  const model = (attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] as string) || 'unknown';
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;

  const span = startInactiveSpan({
    name: `${operation} ${model}`,
    op: `gen_ai.${operation}`,
    attributes,
  });

  if (recordInputs && params) {
    addGoogleGenAIRequestAttributes(span, params, operation, enableTruncation);
  }

  return span;
}

type AsyncIterableStream = { [Symbol.asyncIterator]: () => AsyncIterator<unknown> };

function isAsyncIterable(value: unknown): value is AsyncIterableStream {
  return !!value && typeof (value as AsyncIterableStream)[Symbol.asyncIterator] === 'function';
}

/**
 * Only the streaming methods (`generateContentStream`/`sendMessageStream`) resolve to an async iterable.
 * For a stream we patch `result[Symbol.asyncIterator]` in place so `instrumentGoogleGenAIStream` ends the
 * span when iteration finishes.
 */
function wrapStreamResult(span: Span, data: GoogleGenAIChannelContext, options: GoogleGenAIOptions): boolean {
  const result = data.result;
  if (!isAsyncIterable(result)) {
    return false;
  }

  const { recordOutputs } = resolveAIRecordingOptions(options);
  const iterate = result[Symbol.asyncIterator].bind(result);
  const instrumented = instrumentGoogleGenAIStream({ [Symbol.asyncIterator]: iterate }, span, recordOutputs ?? false);
  result[Symbol.asyncIterator] = () => instrumented;

  return true;
}

/**
 * EXPERIMENTAL — orchestrion-driven Google GenAI integration. Subscribes to the
 * `orchestrion:@google/genai:*` diagnostics_channels injected into the SDK's `Models`
 * (`generateContent`/`generateContentStream`/`embedContent`) and `Chat`
 * (`sendMessage`/`sendMessageStream`) methods, so it requires the orchestrion runtime hook or
 * bundler plugin.
 */
export const googleGenAIChannelIntegration = defineIntegration(_googleGenAIChannelIntegration);
