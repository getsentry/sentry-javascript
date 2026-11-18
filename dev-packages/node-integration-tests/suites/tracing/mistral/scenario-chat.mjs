import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

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
      const chunks = [
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [
            {
              index: 0,
              delta: { content: 'Hello from Mistral streaming!' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 },
        },
      ];

      streamSseEvents(res, chunks, { done: true });
    } else {
      res.send({
        id: 'chatcmpl-mock123',
        object: 'chat.completion',
        created: 1677652288,
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from Mistral mock!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      });
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Mistral({
      apiKey: 'mock-api-key',
      serverURL: server.url,
    });

    await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
      temperature: 0.7,
      maxTokens: 100,
    });

    try {
      await client.chat.complete({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // expected
    }

    const stream = await client.chat.stream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Tell me about streaming' }],
      temperature: 0.8,
    });

    for await (const event of stream) {
      void event;
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
