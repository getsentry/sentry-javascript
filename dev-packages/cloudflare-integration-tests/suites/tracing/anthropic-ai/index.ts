import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// Return a canned response so the `@anthropic-ai/sdk` runs on workerd without hitting the network.
const mockFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      id: 'msg_mock123',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-haiku-20240307',
      content: [{ type: 'text', text: 'Hello from Anthropic!' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 15 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    dataCollection: { genAI: { inputs: true, outputs: true } },
  }),
  {
    async fetch(_request, _env, _ctx) {
      // Wrapped in-request so the SDK is initialized when recording options are resolved, which is
      // also the only place a real Worker can read its API key from `env`.
      const client = Sentry.instrumentAnthropicAiClient(new Anthropic({ apiKey: 'mock-api-key', fetch: mockFetch }));

      const response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
        temperature: 0.7,
        max_tokens: 100,
      });

      return new Response(JSON.stringify(response));
    },
  },
);
