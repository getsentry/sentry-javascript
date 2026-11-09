import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/openai/chat/completions', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    const chunks = [
      {
        id: 'chatcmpl-midway',
        object: 'chat.completion.chunk',
        model: req.body.model,
        choices: [{ index: 0, delta: { role: 'assistant', content: 'This stream will ' } }],
      },
      {
        id: 'chatcmpl-midway',
        object: 'chat.completion.chunk',
        model: req.body.model,
        choices: [{ index: 0, delta: { content: 'be cut off' } }],
      },
    ];
    chunks.forEach((chunk, index) => {
      setTimeout(() => res.write(`data: ${JSON.stringify(chunk)}\n\n`), index * 10);
    });

    // The midway case drops the connection after the chunks are parsed, without a final chunk or `[DONE]`.
    setTimeout(
      () => (req.body.model === 'midway-error' ? res.destroy() : res.end('data: [DONE]\n\n')),
      chunks.length * 10 + 50,
    );
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
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
      apiKey: 'mock-api-key',
    });

    try {
      const stream = await client.chat.completions.create({
        model: 'midway-error',
        messages: [{ role: 'user', content: 'This will fail midway' }],
        stream: true,
      });
      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }

    const stream = await client.chat.completions.create({
      model: 'early-break',
      messages: [{ role: 'user', content: 'The caller stops reading after the first chunk' }],
      stream: true,
    });
    for await (const _ of stream) {
      break;
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
