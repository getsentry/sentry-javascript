import express from 'express';
import * as Sentry from '@sentry/node';
import { chat } from '@tanstack/ai';
import { createOpenaiChatCompletions } from '@tanstack/ai-openai';

// Inlined OpenAI mock that rejects the key: the runner copies only this file into its temp dir.
function startMockProvider() {
  const app = express();
  app.post('/v1/chat/completions', (_req, res) => {
    res.status(401).json({ error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } });
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
  try {
    // Without streaming, `chat()` rejects on the provider error and reads no further chunks.
    await chat({ adapter, threadId: 'thread-1', messages: [{ role: 'user', content: 'Hi' }], stream: false });
  } catch {
    // The 401 of the provider.
  }
});

server.close();
