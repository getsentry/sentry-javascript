import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer } from '@sentry-internal/node-integration-tests';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  app.post('/:apiVersion/models/:model\\:batchEmbedContents', (req, res) => {
    const model = req.params.model;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    res.send({
      embeddings: [
        {
          values: [0.1, 0.2, 0.3, 0.4, 0.5],
        },
      ],
    });
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockGoogleGenAIServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: server.url },
    });

    // Test 1: Basic embedContent with string contents
    await client.models.embedContent({
      model: 'text-embedding-004',
      contents: 'What is the capital of France?',
    });

    // Test 2: Error handling
    try {
      await client.models.embedContent({
        model: 'error-model',
        contents: 'This will fail',
      });
    } catch {
      // Expected error
    }

    // Test 3: embedContent with array contents
    await client.models.embedContent({
      model: 'text-embedding-004',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'First input text' }],
        },
        {
          role: 'user',
          parts: [{ text: 'Second input text' }],
        },
      ],
    });
  });

  server.close();
}

run();
