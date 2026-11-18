import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    res.send(
      anthropicMessage(req.body.model, {
        id: 'msg_mock_tool_1',
        content: [
          { type: 'text', text: 'Let me check the weather.' },
          { type: 'tool_use', id: 'tool_weather_1', name: 'weather', input: { city: 'Paris' } },
          { type: 'text', text: 'It is sunny.' },
        ],
        usage: { input_tokens: 5, output_tokens: 7 },
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

    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [
        {
          name: 'weather',
          description: 'Get the weather by city',
          input_schema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
