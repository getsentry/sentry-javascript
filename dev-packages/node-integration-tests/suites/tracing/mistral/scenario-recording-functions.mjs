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
    const options = { id: `cmpl-${model}`, content: 'Paris.' };

    if (stream) {
      streamSseEvents(res, openAiChatCompletionChunks(model, options), { done: true });
    } else {
      res.send(openAiChatCompletion(model, options));
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
    const messages = privacy => [{ role: 'user', content: `${privacy}: capital of France?` }];

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await client.chat.complete({ model: 'mistral-public', messages: messages('Public') });
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await client.chat.complete({ model: 'mistral-private', messages: messages('Private') });

      // Changing the tag after a call started must not change its outputs decision.
      const stream = await client.chat.stream({ model: 'mistral-public-stream', messages: messages('Public') });
      Sentry.getCurrentScope().setTag('privacy', 'public');
      for await (const event of stream) {
        void event;
      }
    });
  });

  server.close();
}

run();
