import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json());

  // Embeddings endpoint
  app.post('/openai/embeddings', (req, res) => {
    const { model } = req.body;

    // Handle error model
    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    // Return embeddings response
    res.send({
      object: 'list',
      data: [
        {
          object: 'embedding',
          embedding: [0.1, 0.2, 0.3],
          index: 0,
        },
      ],
      model: model,
      usage: {
        prompt_tokens: 10,
        total_tokens: 10,
      },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
      apiKey: 'mock-api-key',
    });

    // First test: embeddings API
    await client.embeddings.create({
      input: 'Embedding test!',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      encoding_format: 'float',
    });

    // Second test: embeddings API error model
    try {
      await client.embeddings.create({
        input: 'Error embedding test!',
        model: 'error-model',
      });
    } catch {
      // Error is expected and handled
    }

    // Third test: embeddings API with multiple inputs
    await client.embeddings.create({
      input: ['First input text', 'Second input text', 'Third input text'],
      model: 'text-embedding-3-small',
    });
  });

  server.close();
}

run();
