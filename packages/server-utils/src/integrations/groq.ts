import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { groqModuleNames } from '../orchestrion/config/groq';
import { createOpenAiCompatibleIntegration } from './openai-compatible';

/**
 * Instruments the `groq-sdk` client (chat completions and embeddings). Groq speaks the OpenAI wire format,
 * so this reuses the openai span/streaming logic; see `createOpenAiCompatibleIntegration`. Requires the
 * Sentry runtime hook or bundler plugin so the diagnostics channels get injected into `groq-sdk`.
 */
export const groqIntegration = defineIntegration(
  createOpenAiCompatibleIntegration({
    integrationName: 'Groq',
    providerName: 'groq',
    origin: 'auto.ai.groq',
    moduleNames: groqModuleNames,
    channels: { chat: CHANNELS.GROQ_CHAT, embeddings: CHANNELS.GROQ_EMBEDDINGS },
  }),
);
