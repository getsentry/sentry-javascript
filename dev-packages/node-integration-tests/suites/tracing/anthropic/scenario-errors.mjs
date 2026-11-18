import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

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

    res.send(
      anthropicMessage(req.body.model, {
        id: 'msg_ok',
        content: [{ type: 'tool_use', id: 'tool_ok_1', name: 'calculator', input: { expression: '2+2' } }],
        usage: { input_tokens: 7, output_tokens: 9 },
      }),
    );
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `${server.url}/anthropic`,
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

    // 2. Successful tool usage for comparison
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
