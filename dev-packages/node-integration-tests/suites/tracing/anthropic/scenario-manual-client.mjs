import { instrumentAnthropicAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockAnthropic {
  constructor(config) {
    this.apiKey = config.apiKey;

    // Create messages object with create and countTokens methods
    this.messages = {
      create: this._messagesCreate.bind(this),
      countTokens: this._messagesCountTokens.bind(this),
    };

    this.models = {
      retrieve: this._modelsRetrieve.bind(this),
    };
  }

  /**
   * Create a mock message
   */
  async _messagesCreate(params) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    if (params.model === 'error-model') {
      const error = new Error('Model not found');
      error.status = 404;
      error.headers = { 'x-request-id': 'mock-request-123' };
      throw error;
    }

    return {
      id: 'msg_mock123',
      type: 'message',
      model: params.model,
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
    };
  }

  async _messagesCountTokens() {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    // For countTokens, just return input_tokens
    return {
      input_tokens: 15,
    };
  }

  async _modelsRetrieve(modelId) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    // Match what the actual implementation would return
    return {
      id: modelId,
      name: modelId,
      created_at: 1715145600,
      model: modelId, // Add model field to match the check in addResponseAttributes
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockAnthropic({
      apiKey: 'mock-api-key',
    });

    const client = instrumentAnthropicAiClient(mockClient);

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
}

run();
