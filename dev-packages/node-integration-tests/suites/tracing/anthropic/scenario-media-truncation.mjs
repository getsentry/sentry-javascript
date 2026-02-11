import { instrumentAnthropicAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockAnthropic {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;

    // Create messages object with create method
    this.messages = {
      create: this._messagesCreate.bind(this),
    };
  }

  /**
   * Create a mock message
   */
  async _messagesCreate(params) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      id: 'msg-truncation-test',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'This is the number **3**.',
        },
      ],
      model: params.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 15,
      },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockAnthropic({
      apiKey: 'mock-api-key',
    });

    const client = instrumentAnthropicAiClient(mockClient);

    // Send the image showing the number 3
    // Put the image in the last message so it doesn't get dropped
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: 'what number is this?',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64-mumbo-jumbo'.repeat(100),
              },
            },
          ],
        },
      ],
      temperature: 0.7,
    });
  });
}

run();
