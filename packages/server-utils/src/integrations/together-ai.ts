import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { togetherAiModuleNames } from '../orchestrion/config/together-ai';
import { createOpenAiCompatibleIntegration } from './openai-compatible';

/**
 * Instruments the `together-ai` client (chat completions and embeddings). Together speaks the OpenAI wire
 * format, so this reuses the openai span/streaming logic; see `createOpenAiCompatibleIntegration`. Requires
 * the Sentry runtime hook or bundler plugin so the diagnostics channels get injected into `together-ai`.
 */
export const togetherAIIntegration = defineIntegration(
  createOpenAiCompatibleIntegration({
    integrationName: 'TogetherAI',
    providerName: 'together_ai',
    origin: 'auto.ai.together_ai',
    moduleNames: togetherAiModuleNames,
    channels: { chat: CHANNELS.TOGETHER_CHAT, embeddings: CHANNELS.TOGETHER_EMBEDDINGS },
  }),
);
