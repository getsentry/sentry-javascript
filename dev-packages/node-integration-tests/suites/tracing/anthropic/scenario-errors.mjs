import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    if (req.body.model === 'invalid-format') {
      res
        .status(400)
        .set('x-request-id', 'mock-invalid-tool-format-error')
        .send({ type: 'error', error: { type: 'invalid_request_error', message: 'Invalid format' } });
      return;
    }

    res.send({
      id: 'msg_ok',
      type: 'message',
      model: req.body.model,
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tool_ok_1', name: 'calculator', input: { expression: '2+2' } }],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 7, output_tokens: 9 },
    });
  });

  app.get('/anthropic/v1/models/:model', (req, res) => {
    if (req.params.model === 'nonexistent-model') {
      res
        .status(404)
        .set('x-request-id', 'mock-model-retrieval-error')
        .send({ type: 'error', error: { type: 'not_found_error', message: 'Model not found' } });
      return;
    }
    res.send({ id: req.params.model, name: req.params.model, created_at: 1715145600, model: req.params.model });
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

    // 1. Invalid format error
    try {
      await client.messages.create({
        model: 'invalid-format',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Here are the results:' },
              { type: 'tool_result', tool_use_id: 'toolu_01' },
            ],
          },
        ],
      });
    } catch {
      // Error expected
    }

    // 2. Model retrieval error
    try {
      await client.models.retrieve('nonexistent-model');
    } catch {
      // Error expected
    }

    // 3. Successful tool usage for comparison
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Calculate 2+2' }],
      tools: [
        {
          name: 'calculator',
          description: 'Perform calculations',
          input_schema: {
            type: 'object',
            properties: { expression: { type: 'string' } },
            required: ['expression'],
          },
        },
      ],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
