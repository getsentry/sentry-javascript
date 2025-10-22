import { ChatAnthropic } from '@langchain/anthropic';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    const model = req.body.model;

    // Simulate tool call response
    res.json({
      id: 'msg_tool_test_123',
      type: 'message',
      role: 'assistant',
      model: model,
      content: [
        {
          type: 'text',
          text: 'Let me check the weather for you.',
        },
        {
          type: 'tool_use',
          id: 'toolu_01A09q90qw90lq917835lq9',
          name: 'get_weather',
          input: { location: 'San Francisco, CA' },
        },
        {
          type: 'text',
          text: 'The weather looks great!',
        },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 20,
        output_tokens: 30,
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
  const baseUrl = `http://localhost:${server.address().port}`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 150,
      apiKey: 'mock-api-key',
      clientOptions: {
        baseURL: baseUrl,
      },
    });

    await model.invoke('What is the weather in San Francisco?', {
      tools: [
        {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          input_schema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA',
              },
            },
            required: ['location'],
          },
        },
      ],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
