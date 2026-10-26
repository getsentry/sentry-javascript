import OpenAI from 'openai';

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

export default {
  async fetch(_request, _env, _ctx) {
    // Not wrapped with `instrumentOpenAiClient`: the vite plugin instruments the `openai` package.
    const client = new OpenAI({ apiKey: 'mock-api-key', fetch: mockFetch });
    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });
    return new Response('ok');
  },
} satisfies ExportedHandler;
