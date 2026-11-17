import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;
    const id = `cmpl-${model}`;

    if (!stream) {
      res.send({
        id,
        object: 'chat.completion',
        created: 1677652288,
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Paris.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    const chunks = [
      {
        id,
        object: 'chat.completion.chunk',
        created: 1677652300,
        model,
        choices: [{ index: 0, delta: { content: 'Paris.' }, finish_reason: null }],
      },
      {
        id,
        object: 'chat.completion.chunk',
        created: 1677652300,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ];
    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
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

  await Sentry.flush(2000);
  server.close();
}

run();
