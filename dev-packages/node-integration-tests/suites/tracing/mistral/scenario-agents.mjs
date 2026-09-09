import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/agents/completions', (req, res) => {
    const { agent_id: agentId, stream } = req.body;

    if (agentId === 'error-agent') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Agent not found');
      return;
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunks = [
        {
          id: 'agentcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model: 'mistral-large-latest',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'agentcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model: 'mistral-large-latest',
          choices: [
            {
              index: 0,
              delta: { content: 'Hello from Mistral agent streaming!' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'agentcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model: 'mistral-large-latest',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 },
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
        id: 'agentcmpl-mock123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello from Mistral agent!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
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

    await client.agents.complete({
      agentId: 'ag-mock-123',
      messages: [{ role: 'user', content: 'Who is the best French painter?' }],
    });

    const stream = await client.agents.stream({
      agentId: 'ag-mock-123',
      messages: [{ role: 'user', content: 'Tell me about streaming' }],
    });

    for await (const event of stream) {
      void event;
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
