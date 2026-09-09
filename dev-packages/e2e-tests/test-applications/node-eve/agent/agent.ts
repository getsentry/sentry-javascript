import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineAgent } from "eve";

// We call OpenRouter directly (rather than the default Vercel AI Gateway) so the
// e2e test needs only a single OpenRouter key. eve resolves this authored
// `LanguageModel` at runtime.
const openrouter = createOpenRouter({
  apiKey: process.env.E2E_OPENROUTER_API_KEY,
});

export default defineAgent({
  model: openrouter("openai/gpt-4o-mini"),
  // A direct-provider model is not in the AI Gateway catalog, so eve cannot look
  // up its context window for compaction. Provide it explicitly.
  modelContextWindowTokens: 128_000,
  build: {
    // `dataloader` is instrumented by Sentry via orchestrion (a module
    // transform). Keep it external so it stays a real module the transform can
    // hook; if eve inlined it into the server bundle it could never be
    // instrumented. (The Vercel AI SDK needs none of this — it uses a native
    // diagnostics channel.)
    externalDependencies: ["dataloader"],
  },
});
