import Together from 'together-ai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    // error-model returns 404 (not retried by the SDK) so the span records an error
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
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
          choices: [{ index: 0, delta: { content: 'Hello from Together streaming!' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model,
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
        id: 'chatcmpl-mock123',
        object: 'chat.completion',
        created: 1677652288,
        model,
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Hello from Together mock!' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      });
    }
  });

  app.post('/embeddings', (req, res) => {
    const { model } = req.body;
    res.send({
      id: 'embd-mock123',
      object: 'list',
      model,
      data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 8, total_tokens: 8 },
    });
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
    const client = new Together({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}`,
    });

    await client.chat.completions.create({
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    try {
      await client.chat.completions.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // expected
    }

    const stream = await client.chat.completions.create({
      model: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
      messages: [{ role: 'user', content: 'Tell me about streaming' }],
      temperature: 0.8,
      stream: true,
    });

    for await (const chunk of stream) {
      void chunk;
    }

    await client.embeddings.create({
      model: 'togethercomputer/m2-bert-80M-8k-retrieval',
      input: 'Embedding test!',
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
