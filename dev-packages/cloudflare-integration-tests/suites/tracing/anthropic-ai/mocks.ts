import type { AnthropicAiClient } from '@sentry/core';

export class MockAnthropic implements AnthropicAiClient {
  public messages: {
    create: (...args: unknown[]) => Promise<unknown>;
    countTokens: (...args: unknown[]) => Promise<unknown>;
  };
  public models: {
    list: (...args: unknown[]) => Promise<unknown>;
    get: (...args: unknown[]) => Promise<unknown>;
  };
  public completions: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
  public apiKey: string;

  public constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;

    // Main focus: messages.create functionality
    this.messages = {
      create: async (...args: unknown[]) => {
        const params = args[0] as { model: string; stream?: boolean };
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          (error as unknown as { status: number }).status = 404;
          (error as unknown as { headers: Record<string, string> }).headers = { 'x-request-id': 'mock-request-123' };
          throw error;
        }

        return {
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
      },
      countTokens: async (..._args: unknown[]) => ({ input_tokens: 0 }),
    };

    // Minimal implementations for required interface compliance
    this.models = {
      list: async (..._args: unknown[]) => ({ data: [] }),
      get: async (..._args: unknown[]) => ({ id: 'mock', type: 'model' }),
    };

    this.completions = {
      create: async (..._args: unknown[]) => ({ id: 'mock', type: 'completion' }),
    };
  }
}
