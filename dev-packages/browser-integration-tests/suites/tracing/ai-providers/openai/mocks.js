// Mock OpenAI client for browser testing
export class MockOpenAi {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.chat = {
      completions: {
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
            id: 'chatcmpl-mock123',
            object: 'chat.completion',
            created: 1677652288,
            model: params.model,
            system_fingerprint: 'fp_44709d6fcb',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Hello from OpenAI mock!',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 15,
              total_tokens: 25,
            },
          };
          return response;
        },
      },
    };
  }
}
