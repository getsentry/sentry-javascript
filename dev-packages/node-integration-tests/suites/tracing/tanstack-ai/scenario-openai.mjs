import express from 'express';
import * as Sentry from '@sentry/node';
import { chat } from '@tanstack/ai';
import { createOpenaiChatCompletions } from '@tanstack/ai-openai';

// Inlined OpenAI-compatible streaming mock: the runner copies only this file into its temp dir.
function startMockProvider() {
  const app = express();
  app.use(express.json());
  app.post('/v1/chat/completions', (req, res) => {
    const base = { id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1, model: 'gpt-4o-2024-08-06' };
    res.setHeader('content-type', 'text/event-stream');
    const send = chunk => res.write(`data: ${JSON.stringify({ ...base, ...chunk })}\n\n`);
    send({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello!' }, finish_reason: null }] });
    send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    send({
      choices: [],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 5,
        total_tokens: 25,
        prompt_tokens_details: { cached_tokens: 8 },
        completion_tokens_details: { reasoning_tokens: 2 },
      },
    });
    res.end('data: [DONE]\n\n');
  });
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

const server = await startMockProvider();
const adapter = createOpenaiChatCompletions('gpt-4o', 'test-key', {
  baseURL: `http://localhost:${server.address().port}/v1`,
});

await Sentry.startSpan({ name: 'main' }, async () => {
  await chat({ adapter, threadId: 'thread-1', messages: [{ role: 'user', content: 'Hi' }], stream: false });
});

server.close();
