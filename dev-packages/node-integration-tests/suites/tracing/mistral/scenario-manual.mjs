import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunks = [
        {
          id: 'chatcmpl-manual-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { role: 'assistant', content: 'Manual ' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-manual-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { content: 'streaming!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
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
        id: 'chatcmpl-manual-123',
        object: 'chat.completion',
        created: 1677652288,
        model,
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Hello from the manual client!' }, finish_reason: 'stop' },
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
    const client = Sentry.instrumentMistralAiClient(
      new Mistral({ apiKey: 'mock-api-key', serverURL: `http://localhost:${server.address().port}` }),
      { recordInputs: true, recordOutputs: true },
    );

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
