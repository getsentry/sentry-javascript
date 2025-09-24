import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages/count_tokens', (req, res) => {
    res.send({
      input_tokens: 15,
    });
  });

  app.get('/anthropic/v1/models/:model', (req, res) => {
    res.send({
      id: req.params.model,
      name: req.params.model,
      created_at: 1715145600,
      model: req.params.model,
    });
  });

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').send('Model not found');
      return;
    }

    res.send({
      id: 'msg_mock123',
      type: 'message',
      model,
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Hello from Anthropic mock!',
        },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 15,
      },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });

    // First test: basic message completion
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      temperature: 0.7,
      max_tokens: 100,
    });

    // Second test: error handling
    try {
      await client.messages.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // Error is expected and handled
    }

    // Third test: count tokens with cached tokens
    await client.messages.countTokens({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });

    // Fourth test: models.retrieve
    await client.models.retrieve('claude-3-haiku-20240307');
  });

  server.close();
}

run();
