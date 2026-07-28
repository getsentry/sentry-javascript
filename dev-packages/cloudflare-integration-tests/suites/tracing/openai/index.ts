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
      system_fingerprint: 'fp_44709d6fcb',
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

const client = Sentry.instrumentOpenAiClient(new OpenAI({ apiKey: 'mock-api-key', fetch: mockFetch }));

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    streamGenAiSpans: true,
  }),
  {
    async fetch(_request, _env, _ctx) {
      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return new Response(JSON.stringify(response));
    },
  },
);
