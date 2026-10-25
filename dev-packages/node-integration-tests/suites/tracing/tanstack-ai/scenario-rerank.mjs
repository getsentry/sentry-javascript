import express from 'express';
import * as Sentry from '@sentry/node';
import { rerank } from '@tanstack/ai';
import { createOpenRouterRerank } from '@tanstack/ai-openrouter';

// Inlined OpenRouter rerank mock: the runner copies only this file into its temp dir.
function startMockProvider() {
  const app = express();
  app.use(express.json());
  app.post('/rerank', (req, res) => {
    const results = req.body.documents
      .map((text, index) => ({ index, relevance_score: 1 - index / 10, document: { text } }))
      .reverse();
    res.json({
      id: 'gen-rerank-1',
      model: 'cohere/rerank-v3.5',
      // An index that is out of range makes `rerank()` throw after the provider answered.
      results: req.body.query.includes('out of range')
        ? [...results, { index: results.length, relevance_score: 0, document: { text: '' } }]
        : results,
      usage: { total_tokens: 12, search_units: 1, cost: 0.002 },
    });
  });
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

const server = await startMockProvider();
const adapter = createOpenRouterRerank('cohere/rerank-v3.5', 'test-key', {
  serverURL: `http://localhost:${server.address().port}`,
});

const documents = ['A heavy gaming desktop', 'A lightweight ultrabook with all-day battery'];

await Sentry.startSpan({ name: 'main' }, async () => {
  await rerank({ adapter, query: 'A laptop for travel', documents });

  await Sentry.startSpan({ name: 'failed' }, async () => {
    try {
      await rerank({ adapter, query: 'Answer out of range', documents });
    } catch {
      // `rerank()` throws on the index that is out of range.
    }
  });
});

server.close();
