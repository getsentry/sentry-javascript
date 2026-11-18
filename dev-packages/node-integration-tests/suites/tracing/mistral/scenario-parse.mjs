import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { z } from 'zod';
import {
  openAiChatCompletion,
  openAiChatCompletionChunks,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

// `chat.parse` and `chat.parseStream` are the structured-output entry points. They call the
// underlying request functions directly rather than `this.complete` / `this.stream`, so they need
// their own orchestrion entries — and cannot produce a duplicate span from the sibling method.
function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    if (stream) {
      const chunks = openAiChatCompletionChunks(model, {
        id: 'chatcmpl-parse-stream-123',
        content: '{"city":"Paris"}',
        usage: { prompt_tokens: 4, completion_tokens: 6 },
      });
      streamSseEvents(res, chunks, { done: true });
      return;
    }

    res.send(
      openAiChatCompletion(model, {
        id: 'chatcmpl-parse-123',
        content: '{"city":"Paris"}',
        usage: { prompt_tokens: 5, completion_tokens: 7 },
      }),
    );
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

    const responseFormat = z.object({ city: z.string() });

    await client.chat.parse({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Which city?' }],
      responseFormat,
    });

    const stream = await client.chat.parseStream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Which city?' }],
      responseFormat,
    });

    for await (const event of stream) {
      void event;
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
