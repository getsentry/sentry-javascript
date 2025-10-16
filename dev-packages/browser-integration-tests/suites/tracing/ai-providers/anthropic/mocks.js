// Mock Anthropic client for browser testing
export class MockAnthropic {
  constructor(config) {
    this.apiKey = config.apiKey;

    // Main focus: messages.create functionality
    this.messages = {
      create: async (...args) => {
        const params = args[0];
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          error.status = 404;
          error.headers = { 'x-request-id': 'mock-request-123' };
          throw error;
        }

        const response = {
          id: 'msg_mock123',
          type: 'message',
          role: 'assistant',
          model: params.model,
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
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        };
        return response;
      },
      countTokens: async (..._args) => ({ id: 'mock', type: 'model', model: 'mock', input_tokens: 0 }),
    };

    // Minimal implementations for required interface compliance
    this.models = {
      list: async (..._args) => ({ id: 'mock', type: 'model', model: 'mock' }),
      get: async (..._args) => ({ id: 'mock', type: 'model', model: 'mock' }),
    };

    this.completions = {
      create: async (..._args) => ({ id: 'mock', type: 'completion', model: 'mock' }),
    };
  }
}
