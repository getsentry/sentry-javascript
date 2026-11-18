import { OpenAIEmbeddings } from '@langchain/openai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer } from '@sentry-internal/node-integration-tests';

function startMockOpenAIServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/embeddings', (req, res) => {
    const { model, input } = req.body;

    if (model === 'error-model') {
      res.status(400).json({
        error: {
          message: 'Model not found',
          type: 'invalid_request_error',
        },
      });
      return;
    }

    const inputs = Array.isArray(input) ? input : [input];
    res.json({
      object: 'list',
      data: inputs.map((_, i) => ({
        object: 'embedding',
        embedding: [0.1, 0.2, 0.3],
        index: i,
      })),
      model: model,
      usage: {
        prompt_tokens: 10,
        total_tokens: 10,
      },
    });
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockOpenAIServer();
  const baseUrl = `${server.url}/v1`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Test 1: embedQuery
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      dimensions: 1536,
      apiKey: 'mock-api-key',
      configuration: { baseURL: baseUrl },
    });

    await embeddings.embedQuery('Hello world');

    // Test 2: embedDocuments
    await embeddings.embedDocuments(['First document', 'Second document']);

    // Test 3: Error handling
    const errorEmbeddings = new OpenAIEmbeddings({
      model: 'error-model',
      apiKey: 'mock-api-key',
      configuration: { baseURL: baseUrl },
    });

    try {
      await errorEmbeddings.embedQuery('This will fail');
    } catch {
      // Expected error
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
