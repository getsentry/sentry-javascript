import Together from 'together-ai';
import * as Sentry from '@sentry/node';
import express from 'express';
import {
  openAiChatCompletion,
  openAiChatCompletionChunks,
  openAiEmbeddings,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    // error-model returns 404 (not retried by the SDK) so the span records an error
    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    if (stream) {
      streamSseEvents(res, openAiChatCompletionChunks(model, { content: 'Hello from Together streaming!' }), {
        done: true,
      });
      return;
    }

    res.send(openAiChatCompletion(model, { content: 'Hello from Together mock!' }));
  });

  app.post('/v1/embeddings', (req, res) => {
    res.send(openAiEmbeddings(req.body.model));
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Together({
      apiKey: 'mock-api-key',
      baseURL: server.url,
    });

    await client.chat.completions.create({
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });

    try {
      await client.chat.completions.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // expected
    }

    const stream = await client.chat.completions.create({
      model: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
      messages: [{ role: 'user', content: 'Tell me about streaming' }],
      stream: true,
    });
    for await (const chunk of stream) {
      void chunk;
    }

    await client.embeddings.create({
      model: 'togethercomputer/m2-bert-80M-8k-retrieval',
      input: 'Embedding test!',
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
