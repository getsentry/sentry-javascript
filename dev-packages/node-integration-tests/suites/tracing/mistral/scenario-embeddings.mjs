import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/embeddings', (req, res) => {
    const { model } = req.body;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    res.send({
      id: 'embd-mock123',
      object: 'list',
      model,
      data: [{ object: 'embedding', embedding: [0.1, 0.2, 0.3], index: 0 }],
      usage: { prompt_tokens: 8, total_tokens: 8 },
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
    const client = new Mistral({
      apiKey: 'mock-api-key',
      serverURL: `http://localhost:${server.address().port}`,
    });

    await client.embeddings.create({
      model: 'mistral-embed',
      inputs: 'Embedding test!',
    });

    try {
      await client.embeddings.create({
        model: 'error-model',
        inputs: 'Error embedding test!',
      });
    } catch {
      // expected
    }

    await client.embeddings.create({
      model: 'mistral-embed',
      inputs: ['First input text', 'Second input text'],
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
