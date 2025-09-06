import { instrumentAnthropicAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockAnthropic {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.messages = {
      create: this._messagesCreate.bind(this),
    };
    this.models = {
      retrieve: this._modelsRetrieve.bind(this),
    };
  }

  async _messagesCreate(params) {
    await new Promise(resolve => setTimeout(resolve, 5));

    // Case 1: Invalid tool format error
    if (params.model === 'invalid-format') {
      const error = new Error('Invalid format');
      error.status = 400;
      error.headers = { 'x-request-id': 'mock-invalid-tool-format-error' };
      throw error;
    }

    // Default case (success) - return tool use for successful tool usage test
    return {
      id: 'msg_ok',
      type: 'message',
      model: params.model,
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tool_ok_1',
          name: 'calculator',
          input: { expression: '2+2' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 7, output_tokens: 9 },
    };
  }

  async _modelsRetrieve(modelId) {
    await new Promise(resolve => setTimeout(resolve, 5));

    // Case for model retrieval error
    if (modelId === 'nonexistent-model') {
      const error = new Error('Model not found');
      error.status = 404;
      error.headers = { 'x-request-id': 'mock-model-retrieval-error' };
      throw error;
    }

    return {
      id: modelId,
      name: modelId,
      created_at: 1715145600,
      model: modelId,
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockAnthropic({ apiKey: 'mock-api-key' });
    const client = instrumentAnthropicAiClient(mockClient);

    // 1. Test invalid format error
    // https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use#handling-tool-use-and-tool-result-content-blocks
    try {
      await client.messages.create({
        model: 'invalid-format',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Here are the results:' }, // ❌ Text before tool_result
              { type: 'tool_result', tool_use_id: 'toolu_01' },
            ],
          },
        ],
      });
    } catch {
      // Error expected
    }

    // 2. Test model retrieval error
    try {
      await client.models.retrieve('nonexistent-model');
    } catch {
      // Error expected
    }

    // 3. Test successful tool usage for comparison
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
}

run();
