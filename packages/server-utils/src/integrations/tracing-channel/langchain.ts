import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, LangChainOptions, Span } from '@sentry/core';
import {
  _INTERNAL_getLangChainEmbeddingsSpanOptions,
  _INTERNAL_mergeLangChainCallbackHandler,
  _INTERNAL_skipAiProviderWrapping,
  ANTHROPIC_AI_INTEGRATION_NAME,
  createLangChainCallbackHandler,
  debug,
  defineIntegration,
  GOOGLE_GENAI_INTEGRATION_NAME,
  LANGCHAIN_INTEGRATION_NAME,
  OPENAI_INTEGRATION_NAME,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { langchainEmbeddingsChannels } from '../../orchestrion/config/langchain';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel integration by design: when enabled, the OTel 'LangChain' integration is
// dropped from the default set (see the Node opt-in loader).
const INTEGRATION_NAME = LANGCHAIN_INTEGRATION_NAME;

// LangChain drives the underlying AI provider SDKs itself, so while it's active those providers must
// not also instrument, or every call would produce two spans (mirrors the OTel path's skip list).
const SKIPPED_PROVIDERS = [OPENAI_INTEGRATION_NAME, ANTHROPIC_AI_INTEGRATION_NAME, GOOGLE_GENAI_INTEGRATION_NAME];

// The chat-model channels carry the live args array of `invoke(input, options)` / `_streamIterator(input, options)`.
interface RunnableChannelContext {
  arguments: unknown[];
}

// The embeddings channels carry the instance (`self`) and the `embedQuery(text)` / `embedDocuments(texts)` args.
interface EmbeddingsChannelContext {
  self?: unknown;
  arguments: unknown[];
}

let subscribed = false;

// Registered lazily on the first LangChain call (not at `setupOnce`) so a direct provider call made
// before any LangChain call still gets its own span — matches the OTel patch-on-import timing. It
// also stops the underlying SDK from double-instrumenting embeddings, whose `embedQuery`/
// `embedDocuments` call the provider SDK (e.g. `openai`) internally.
function markProvidersSkipped(): void {
  _INTERNAL_skipAiProviderWrapping(SKIPPED_PROVIDERS);
}

const _langChainChannelIntegration = ((options: LangChainOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19, and a second `init()` would double-subscribe.
      if (!diagnosticsChannel.tracingChannel || subscribed) {
        return;
      }
      subscribed = true;

      // One stateful handler tracks spans across the whole run tree, just like the OTel path.
      const sentryHandler = createLangChainCallbackHandler(options);

      // Chat models: inject the Sentry callback handler into the call options (arg 1). LangChain's own
      // callback dispatch then creates the spans, exactly as in the OTel path, so no span is opened
      // here — a `start` subscriber (which also makes orchestrion wrap the function) is enough.
      const injectHandler = (message: unknown): void => {
        markProvidersSkipped();

        const args = (message as RunnableChannelContext).arguments;
        if (!Array.isArray(args)) {
          return;
        }

        let callOptions = args[1] as Record<string, unknown> | undefined;
        if (!callOptions || typeof callOptions !== 'object' || Array.isArray(callOptions)) {
          callOptions = {};
          args[1] = callOptions;
        }

        callOptions.callbacks = _INTERNAL_mergeLangChainCallbackHandler(callOptions.callbacks, sentryHandler);
      };

      for (const channelName of [CHANNELS.LANGCHAIN_CHAT_MODEL_INVOKE, CHANNELS.LANGCHAIN_CHAT_MODEL_STREAM]) {
        DEBUG_BUILD && debug.log(`[orchestrion:langchain] subscribing to channel "${channelName}"`);
        diagnosticsChannel.tracingChannel<RunnableChannelContext>(channelName).start.subscribe(injectHandler);
      }

      // Embeddings don't use the callback system — the OTel path wraps the method in its own span, so
      // do the same here. `bindTracingChannelToSpan` needs the async-context binding that
      // `initOpenTelemetry()` registers after `setupOnce`, so wait for it before subscribing.
      waitForTracingChannelBinding(() => {
        for (const channelName of langchainEmbeddingsChannels) {
          DEBUG_BUILD && debug.log(`[orchestrion:langchain] subscribing to channel "${channelName}"`);
          // Embedding errors reject to the caller, so we only open the span (which
          // bindTracingChannelToSpan still marks failed on error) and do not capture them.
          bindTracingChannelToSpan(diagnosticsChannel.tracingChannel<EmbeddingsChannelContext>(channelName), data =>
            createEmbeddingsSpan(data, options),
          );
        }
      });
    },
  };
}) satisfies IntegrationFn;

function createEmbeddingsSpan(data: EmbeddingsChannelContext, options: LangChainOptions): Span {
  // `embedQuery`/`embedDocuments` call the provider SDK internally, so skip that SDK's own
  // instrumentation before its channel fires (the producer runs at the embeddings channel's `start`).
  markProvidersSkipped();

  const input = (data.arguments ?? [])[0];

  return startInactiveSpan(_INTERNAL_getLangChainEmbeddingsSpanOptions(data.self, input, options));
}

/**
 * EXPERIMENTAL — orchestrion-driven LangChain integration. Subscribes to the diagnostics_channels
 * injected into `@langchain/core`'s `BaseChatModel` (to inject the Sentry callback handler) and into
 * `@langchain/openai`'s embedding methods, so it requires the orchestrion runtime hook or bundler plugin.
 */
export const langChainChannelIntegration = defineIntegration(_langChainChannelIntegration);
