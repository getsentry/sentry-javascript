import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';
import { startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/openai/chat/completions', (req, res) => {
    const { model, stream, user } = req.body;
    const id = `chatcmpl-${user}${stream ? '-stream' : ''}`;

    if (!stream) {
      res.send({
        id,
        object: 'chat.completion',
        created: 1677652288,
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Paris.' }, finish_reason: 'stop' }],
      });
      return;
    }

    const chunks = [
      {
        id,
        object: 'chat.completion.chunk',
        created: 1677652300,
        model,
        choices: [{ index: 0, delta: { content: 'Paris.' } }],
      },
      {
        id,
        object: 'chat.completion.chunk',
        created: 1677652300,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ];
    streamSseEvents(res, chunks, { done: true });
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
    const messages = [{ role: 'user', content: 'What is the capital of France?' }];

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await client.chat.completions.create({ model: 'gpt-4o', messages, user: 'public' });
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await client.chat.completions.create({ model: 'gpt-4o', messages, user: 'private' });

      // Changing the tag after the call started must not change its outputs decision.
      const stream = await client.chat.completions.create({ model: 'gpt-4o', messages, user: 'public', stream: true });
      Sentry.getCurrentScope().setTag('privacy', 'public');
      for await (const chunk of stream) {
        void chunk;
      }
    });
  });

  server.close();
}

run();
