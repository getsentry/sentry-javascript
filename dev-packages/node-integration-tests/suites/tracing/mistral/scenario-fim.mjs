import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/fim/completions', (req, res) => {
    const { model, stream } = req.body;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunks = [
        {
          id: 'fimcmpl-stream-123',
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
          id: 'fimcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [
            {
              index: 0,
              delta: { content: 'def hello():' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'fimcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 6, completion_tokens: 9, total_tokens: 15 },
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
    } else {
      res.send({
        id: 'fimcmpl-mock123',
        object: 'chat.completion',
        created: 1677652288,
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'def hello():\n    return "world"',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      });
    }
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

    await client.fim.complete({
      model: 'codestral-latest',
      prompt: 'def hello',
      suffix: 'return res',
    });

    const stream = await client.fim.stream({
      model: 'codestral-latest',
      prompt: 'def fib(n)',
    });

    for await (const event of stream) {
      void event;
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
