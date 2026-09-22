import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { z } from 'zod';

// `chat.parse` and `chat.parseStream` are the structured-output entry points. They call the
// underlying request functions directly rather than `this.complete` / `this.stream`, so they need
// their own orchestrion entries — and cannot produce a duplicate span from the sibling method.
function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');

      const chunks = [
        {
          id: 'chatcmpl-parse-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { role: 'assistant', content: '{"city":"Paris"}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
        },
      ];

      chunks.forEach((chunk, index) => {
        setTimeout(() => {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          if (index === chunks.length - 1) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
        }, index * 10);
      });
      return;
    }

    res.send({
      id: 'chatcmpl-parse-123',
      object: 'chat.completion',
      created: 1677652288,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: '{"city":"Paris"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Mistral({
      apiKey: 'mock-api-key',
      serverURL: `http://localhost:${server.address().port}`,
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
