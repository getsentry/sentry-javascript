import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';
import { openAiEmbeddings, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockApi() {
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
    res.send(openAiEmbeddings(model, { promptTokens: 10 }));
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `${server.url}/openai`,
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

    const rawResponse = await client.embeddings
      .create({
        input: 'Raw embedding test!',
        model: 'text-embedding-3-large',
      })
      .asResponse();
    await rawResponse.json();
  });

  server.close();
}

run();
