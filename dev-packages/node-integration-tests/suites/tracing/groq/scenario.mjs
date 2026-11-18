import Groq from 'groq-sdk';
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

  app.post('/openai/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    // error-model returns 404 (not retried by the SDK) so the span records an error
    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    if (stream) {
      streamSseEvents(res, openAiChatCompletionChunks(model, { content: 'Hello from Groq streaming!' }), {
        done: true,
      });
    } else {
      res.send(openAiChatCompletion(model, { content: 'Hello from Groq mock!' }));
    }
  });

  app.post('/openai/v1/embeddings', (req, res) => {
    res.send(openAiEmbeddings(req.body.model));
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Groq({
      apiKey: 'mock-api-key',
      // `groq-sdk` appends `/openai/v1/...` to the baseURL, so it stays bare here.
      baseURL: server.url,
    });

    await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
      temperature: 0.7,
      max_tokens: 100,
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
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Tell me about streaming' }],
      temperature: 0.8,
      stream: true,
    });

    for await (const chunk of stream) {
      void chunk;
    }

    await client.embeddings.create({
      model: 'nomic-embed-text-v1_5',
      input: 'Embedding test!',
    });

    const rawChatResponse = await client.chat.completions
      .create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Raw response test!' }],
      })
      .asResponse();
    await rawChatResponse.json();

    const rawStreamResponse = await client.chat.completions
      .create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Raw stream test!' }],
        stream: true,
      })
      .asResponse();
    await rawStreamResponse.text();

    const rawEmbeddingsResponse = await client.embeddings
      .create({
        model: 'nomic-embed-text-v1_5',
        input: 'Raw embedding test!',
      })
      .asResponse();
    await rawEmbeddingsResponse.json();
  });

  await Sentry.flush(2000);
  server.close();
}

run();
