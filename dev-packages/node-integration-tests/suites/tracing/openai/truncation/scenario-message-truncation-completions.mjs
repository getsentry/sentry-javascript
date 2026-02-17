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
            id: 'chatcmpl-completions-truncation-test',
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

    // Test 1: Given an array of messages only the last message should be kept
    // The last message should be truncated to fit within the 20KB limit
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000) + 'D'.repeat(25000); // ~50KB (will be truncated, only C's remain)

    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: largeContent1 },
        { role: 'user', content: largeContent2 },
        { role: 'user', content: largeContent3 },
      ],
      temperature: 0.7,
    });

    // Test 2: Given an array of messages only the last message should be kept
    // The last message is small, so it should be kept intact
    const smallContent = 'This is a small message that fits within the limit';
    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: largeContent1 },
        { role: 'user', content: largeContent2 },
        { role: 'user', content: smallContent },
      ],
      temperature: 0.7,
    });
  });
}

run();
