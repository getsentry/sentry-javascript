import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    res.send({
      id: 'msg_mock_tool_1',
      type: 'message',
      model: req.body.model,
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check the weather.' },
        { type: 'tool_use', id: 'tool_weather_1', name: 'weather', input: { city: 'Paris' } },
        { type: 'text', text: 'It is sunny.' },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 7 },
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
