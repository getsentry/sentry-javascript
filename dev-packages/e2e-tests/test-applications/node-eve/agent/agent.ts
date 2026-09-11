import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getInstrumentedModuleNames } from '@sentry/node';
import { defineAgent } from 'eve';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

// We call OpenRouter directly (rather than the default Vercel AI Gateway) so the
// e2e test needs only a single OpenRouter key. eve resolves this authored
// `LanguageModel` at runtime.
const openrouter = createOpenRouter({
  apiKey,
});

const useOrchestrion = process.env.USE_ORCHESTRION === '1';

export default defineAgent({
  model: openrouter('openai/gpt-4o-mini'),
  // A direct-provider model is not in the AI Gateway catalog, so eve cannot look
  // up its context window for compaction. Provide it explicitly.
  modelContextWindowTokens: 128_000,
  build: {
    // Only configure externals for orchestrion mode, to ensure everything else works without it
    ...(useOrchestrion
      ? {
          // Keep every package Sentry instruments via orchestrion (a module transform) external, so
          // it stays a real module the transform can hook rather than being inlined into eve's server
          // bundle (an inlined module never reaches the transform's `onLoad`). Rather than hardcode
          // the set, ask the SDK for it — this app exercises `dataloader`, and the rest are no-ops
          // when the app doesn't use them. (The Vercel AI SDK needs none of this; it uses a native
          // diagnostics channel and `ai` v7 is registration-only under the transform.)
          //
          // Do NOT add `@sentry/server-runtime-injection` here: the `--import`
          // loader instruments regardless (so the "bundled ... uninstrumented"
          // warning is a false positive), and externalizing it makes eve's dev
          // host fail to resolve its `/register` subpath (`eve dev` only).
          externalDependencies: getInstrumentedModuleNames(),
        }
      : {}),
  },
});
