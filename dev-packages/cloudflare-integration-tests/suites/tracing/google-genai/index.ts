import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// `@google/genai` has no per-client fetch option — it calls the global `fetch`
// directly. Override it (gated to the Gemini host) so the SDK runs on
// workerd without hitting the network, while Sentry envelope delivery still
// uses the original fetch.
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  if (!url.includes('generativelanguage.googleapis.com')) {
    return originalFetch(input, init);
  }

  if (url.includes(':embedContent') || url.includes(':batchEmbedContents')) {
    return new Response(JSON.stringify({ embeddings: [{ values: [0.1, 0.2, 0.3, 0.4, 0.5] }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: 'Hello from Google GenAI!' }], role: 'model' },
          finishReason: 'stop',
          index: 0,
        },
      ],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12, totalTokenCount: 20 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}) as typeof fetch;

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    dataCollection: { genAI: { inputs: true } },
  }),
  {
    async fetch(_request, _env, _ctx) {
      // Wrapped in-request so the SDK is initialized when recording options are resolved, which is
      // also the only place a real Worker can read its API key from `env`.
      const client = Sentry.instrumentGoogleGenAIClient(new GoogleGenAI({ apiKey: 'mock-api-key' }));

      // Test 1: chats.create and sendMessage flow
      const chat = client.chats.create({
        model: 'gemini-1.5-pro',
        config: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 150,
        },
        history: [
          {
            role: 'user',
            parts: [{ text: 'Hello, how are you?' }],
          },
        ],
      });

      await chat.sendMessage({ message: 'Tell me a joke' });

      // Test 2: models.generateContent
      await client.models.generateContent({
        model: 'gemini-1.5-flash',
        config: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 100,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'What is the capital of France?' }],
          },
        ],
      });

      // Test 3: models.embedContent
      await client.models.embedContent({
        model: 'text-embedding-004',
        contents: 'Hello world',
      });

      return new Response(JSON.stringify({ success: true }));
    },
  },
);
