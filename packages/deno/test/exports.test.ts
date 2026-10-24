import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import * as Sentry from '../build/esm/index.js';

// Exports that Cloudflare ships and that need no Node APIs.
const EXPECTED_FUNCTION_EXPORTS = [
  // @sentry/core
  'addIntegration',
  'withActiveSpan',
  'getSpanDescendants',
  'setConversationId',
  'createConsolaReporter',
  'growthbookIntegration',
  'moduleMetadataIntegration',
  // @sentry/core/server
  'trpcMiddleware',
  'prismaIntegration',
  'instrumentOpenAiClient',
  'instrumentAnthropicAiClient',
  'instrumentGoogleGenAIClient',
  'createLangChainCallbackHandler',
  'instrumentLangChainEmbeddings',
  'instrumentStateGraph',
  'instrumentCreateReactAgent',
];

for (const name of EXPECTED_FUNCTION_EXPORTS) {
  Deno.test(`exports ${name}`, () => {
    assertEquals(typeof (Sentry as Record<string, unknown>)[name], 'function');
  });
}
