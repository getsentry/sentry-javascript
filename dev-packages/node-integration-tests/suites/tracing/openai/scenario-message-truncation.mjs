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

          return {
            id: 'chatcmpl-truncation-test',
            object: 'chat.completion',
            created: 1677652288,
            model: params.model,
            system_fingerprint: 'fp_44709d6fcb',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Response to truncated messages',
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

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockOpenAI({
      apiKey: 'mock-api-key',
    });

    const client = instrumentOpenAiClient(mockClient);

    // Create 3 large messages where:
    // - First 2 messages are very large (will be dropped)
    // - Last message is large but will be truncated to fit within the 20KB limit
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000); // ~25KB (will be truncated)

    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: largeContent1 },
        { role: 'user', content: largeContent2 },
        { role: 'user', content: largeContent3 },
      ],
      temperature: 0.7,
    });
  });
}

run();
