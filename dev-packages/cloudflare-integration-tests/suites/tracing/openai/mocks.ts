import type { OpenAiClient } from '@sentry/core';

export class MockOpenAi implements OpenAiClient {
  public chat?: Record<string, unknown>;
  public apiKey: string;

  public constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;

    this.chat = {
      completions: {
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
        },
      },
    };
  }
}
