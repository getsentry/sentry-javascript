import { instrumentAnthropicAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockAnthropic {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.messages = {
      create: this._messagesCreate.bind(this),
    };
  }

  async _messagesCreate(params) {
    await new Promise(resolve => setTimeout(resolve, 5));

    return {
      id: 'msg_mock_tool_1',
      type: 'message',
      model: params.model,
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check the weather.' },
        {
          type: 'tool_use',
          id: 'tool_weather_1',
          name: 'weather',
          input: { city: 'Paris' },
        },
        { type: 'text', text: 'It is sunny.' },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 5,
        output_tokens: 7,
      },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockAnthropic({ apiKey: 'mock-api-key' });
    const client = instrumentAnthropicAiClient(mockClient);

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
}

run();
