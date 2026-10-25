import express from 'express';
import * as Sentry from '@sentry/node';
import { embed } from '@tanstack/ai';
import { createOpenaiEmbedding } from '@tanstack/ai-openai';
import OpenAI from 'openai';

// Inlined OpenAI-compatible mock: the runner copies only this file into its temp dir.
function startMockProvider() {
  const app = express();
  app.use(express.json());
  app.post('/v1/embeddings', (req, res) => {
    res.json({
      object: 'list',
      data: req.body.input.map((_text, index) => ({ object: 'embedding', embedding: [0.1, 0.2, 0.3], index })),
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 8, total_tokens: 8 },
    });
  });
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

const server = await startMockProvider();
const baseURL = `http://localhost:${server.address().port}/v1`;
const adapter = createOpenaiEmbedding('text-embedding-3-small', 'test-key', { baseURL });

await Sentry.startSpan({ name: 'main' }, async () => {
  await embed({ adapter, input: ['a red guitar', 'a blue drum kit'] });

  await Sentry.startSpan({ name: 'direct' }, async () => {
    await new OpenAI({ apiKey: 'test-key', baseURL }).embeddings.create({
      model: 'text-embedding-3-small',
      input: ['a green piano'],
    });
  });
});

server.close();
