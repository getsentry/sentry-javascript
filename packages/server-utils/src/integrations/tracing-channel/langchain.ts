import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import { _INTERNAL_skipAiProviderWrapping, defineIntegration, startInactiveSpan } from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../../ai/anthropic-ai/constants';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../../ai/google-genai/constants';
import { createLangChainCallbackHandler } from '../../ai/langchain';
import { LANGCHAIN_INTEGRATION_NAME } from '../../ai/langchain/constants';
import { _INTERNAL_getLangChainEmbeddingsSpanOptions } from '../../ai/langchain/embeddings';
import type { GenAiOptions } from '../../ai/core/utils';
import { _INTERNAL_mergeLangChainCallbackHandler } from '../../ai/langchain/utils';
import { OPENAI_INTEGRATION_NAME } from '../../ai/openai/constants';
import { CHANNELS } from '../../orchestrion/channels';
import { langchainEmbeddingsChannels } from '../../orchestrion/config/langchain';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import { langchainModuleNames } from '../../orchestrion/config/langchain';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';

// Same name as the OTel integration by design, so the OTel 'LangChain' integration is
// deduplicated out of the default set.
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

// Registered lazily on the first LangChain call (not at `setupOnce`) so a direct provider call made
// before any LangChain call still gets its own span — matches the OTel patch-on-import timing. It
// also stops the underlying SDK from double-instrumenting embeddings, whose `embedQuery`/
// `embedDocuments` call the provider SDK (e.g. `openai`) internally.
function markProvidersSkipped(): void {
  _INTERNAL_skipAiProviderWrapping(SKIPPED_PROVIDERS);
}

const _langChainIntegration = ((options: GenAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // Chat models only mutate the call args, so they subscribe without the
      // async-context binding. Kept separate so a missing binding never defers
      // them: on the bundler path the wait would push subscription past
      // `Sentry.init()` and early calls would run with no subscriber.
      invokeOrchestrionInstrumentation(client, langchainModuleNames, instrumentChatModels, [options], {
        requiresTracingChannelBinding: false,
      });
      // Embeddings open their own spans via `bindTracingChannelToSpan`, which
      // needs the binding.
      invokeOrchestrionInstrumentation(client, langchainModuleNames, instrumentEmbeddings, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentChatModels(options: GenAiOptions): void {
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
    diagnosticsChannel.tracingChannel<RunnableChannelContext>(channelName).start.subscribe(injectHandler);
  }
}

// Embeddings don't use the callback system. Wrap the method in its own span
function instrumentEmbeddings(options: GenAiOptions): void {
  for (const channelName of langchainEmbeddingsChannels) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<EmbeddingsChannelContext>(channelName),
      data => createEmbeddingsSpan(data, options),
      { captureError: () => ({ mechanism: { handled: false, type: 'auto.ai.langchain' } }) },
    );
  }
}

function createEmbeddingsSpan(data: EmbeddingsChannelContext, options: GenAiOptions): Span {
  // `embedQuery`/`embedDocuments` call the provider SDK internally, so skip that SDK's own
  // instrumentation before its channel fires (the producer runs at the embeddings channel's `start`).
  markProvidersSkipped();

  const input = (data.arguments ?? [])[0];

  return startInactiveSpan(_INTERNAL_getLangChainEmbeddingsSpanOptions(data.self, input, options));
}

/**
 * Orchestrion-driven LangChain integration. Subscribes to the diagnostics_channels
 * injected into `@langchain/core`'s `BaseChatModel` (to inject the Sentry callback handler) and into
 * `@langchain/openai`'s embedding methods, so it requires the orchestrion runtime hook or bundler plugin.
 */
export const langChainIntegration = defineIntegration(_langChainIntegration);
