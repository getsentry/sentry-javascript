import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

// Call OpenRouter directly (rather than the default Vercel AI Gateway) so the
// e2e test needs only a single OpenRouter key, reusing `E2E_OPENROUTER_API_KEY`.
export const openrouter = createOpenRouter({ apiKey });
