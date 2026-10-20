import * as Sentry from '@sentry/cloudflare';
import OpenAI from 'openai';

interface Env {
  SENTRY_DSN: string;
}

// Return a canned response so the `openai` SDK runs on workerd without hitting the network.
const mockFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-mock123',
      object: 'chat.completion',
      created: 1677652288,
      model: 'gpt-3.5-turbo',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from OpenAI!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    // `dataCollection` records inputs by default. The integration options must win over it.
    integrations: [Sentry.openAIIntegration({ recordInputs: false })],
  }),
  {
    async fetch(_request, _env, _ctx) {
      // Not wrapped with `instrumentOpenAiClient`: the vite plugin instruments the `openai` package.
      const client = new OpenAI({ apiKey: 'mock-api-key', fetch: mockFetch });
      await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
      });
      return new Response('ok');
    },
  },
);
