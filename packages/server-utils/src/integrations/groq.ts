import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { groqModuleNames } from '../orchestrion/config/groq';
import { createOpenAiCompatibleIntegration } from './openai-compatible';

// Exported so LangChain can add it to its provider-skip list: `@langchain/groq` drives `groq-sdk`, so
// a `ChatGroq` call would otherwise open both a LangChain span and this integration's Groq span.
export const GROQ_INTEGRATION_NAME = 'Groq' as const;

/**
 * Instruments the `groq-sdk` client (chat completions and embeddings). Groq speaks the OpenAI wire format,
 * so this reuses the openai span/streaming logic; see `createOpenAiCompatibleIntegration`. Requires the
 * Sentry runtime hook or bundler plugin so the diagnostics channels get injected into `groq-sdk`.
 */
export const groqIntegration = defineIntegration(
  createOpenAiCompatibleIntegration({
    integrationName: GROQ_INTEGRATION_NAME,
    providerName: 'groq',
    origin: 'auto.ai.groq',
    moduleNames: groqModuleNames,
    channels: { chat: CHANNELS.GROQ_CHAT, embeddings: CHANNELS.GROQ_EMBEDDINGS },
  }),
);
