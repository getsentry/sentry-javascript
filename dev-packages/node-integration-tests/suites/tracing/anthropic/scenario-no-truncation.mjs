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
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      id: 'msg-no-truncation-test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Response' }],
      model: params.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockAnthropic({ apiKey: 'mock-api-key' });
    const client = instrumentAnthropicAiClient(mockClient, { enableTruncation: false, recordInputs: true });

    // Long array messages (would normally be truncated)
    const longContent = 'A'.repeat(50_000);
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{ role: 'user', content: longContent }],
    });

    // Long string input (should not be wrapped in quotes)
    const longStringInput = 'B'.repeat(50_000);
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      input: longStringInput,
    });
  });
}

run();
