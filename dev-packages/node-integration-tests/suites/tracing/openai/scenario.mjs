import { instrumentOpenAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockOpenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.chat = {
      completions: {
        create: async params => {
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 10));

          if (params.model === 'error-model') {
            const error = new Error('Model not found');
            error.status = 404;
            error.headers = { 'x-request-id': 'mock-request-123' };
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

    this.responses = {
      create: async params => {
        await new Promise(resolve => setTimeout(resolve, 10));

        return {
          id: 'resp_mock456',
          object: 'response',
          created: 1677652290,
          model: params.model,
          input_text: params.input,
          output_text: `Response to: ${params.input}`,
          finish_reason: 'stop',
          usage: {
            input_tokens: 5,
            output_tokens: 8,
            total_tokens: 13,
          },
        };
      },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockOpenAI({
      apiKey: 'mock-api-key',
    });

    const client = instrumentOpenAiClient(mockClient);

    // First test: basic chat completion
    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    // Second test: responses API
    await client.responses.create({
      model: 'gpt-3.5-turbo',
      input: 'Translate this to French: Hello',
      instructions: 'You are a translator',
    });

    // Third test: error handling
    try {
      await client.chat.completions.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // Error is expected and handled
    }
  });
}

run();
