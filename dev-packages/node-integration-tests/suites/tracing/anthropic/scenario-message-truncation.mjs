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
          text: 'Response to truncated messages',
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

    // Create 3 large messages where:
    // - First 2 messages are very large (will be dropped)
    // - Last message is large but will be truncated to fit within the 20KB limit
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000); // ~25KB (will be truncated)

    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        { role: 'user', content: largeContent1 },
        { role: 'assistant', content: largeContent2 },
        { role: 'user', content: largeContent3 },
      ],
      temperature: 0.7,
    });
  });
}

run();
