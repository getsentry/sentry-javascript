import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';
import {
  openAiChatCompletion,
  openAiChatCompletionChunks,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    if (stream) {
      const chunks = openAiChatCompletionChunks(model, {
        id: 'chatcmpl-manual-stream-123',
        content: 'Manual streaming!',
        usage: { prompt_tokens: 5, completion_tokens: 7 },
      });
      streamSseEvents(res, chunks, { done: true });
    } else {
      res.send(openAiChatCompletion(model, { id: 'chatcmpl-manual-123', content: 'Hello from the manual client!' }));
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = Sentry.instrumentMistralAiClient(new Mistral({ apiKey: 'mock-api-key', serverURL: server.url }), {
      recordInputs: true,
      recordOutputs: true,
    });

    await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });

    const stream = await client.chat.stream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Tell me about streaming' }],
    });

    // `EventStream` extends `ReadableStream`, so draining it through a reader has to keep working and
    // has to end the span. Instrumentation that swapped in a bare async generator would throw here.
    const reader = stream.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) {
        break;
      }
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
