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
});
