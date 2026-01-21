import { instrumentOpenAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockOpenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.embeddings = {
      create: async params => {
        await new Promise(resolve => setTimeout(resolve, 10));

        return {
          object: 'list',
          data: [
            {
              object: 'embedding',
              embedding: [0.1, 0.2, 0.3],
              index: 0,
            },
          ],
          model: params.model,
          usage: {
            prompt_tokens: 10,
            total_tokens: 10,
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

    // Test 1: Create 1 large embedding that gets truncated to fit within the 20KB limit
    const largeContent = 'A'.repeat(25000) + 'B'.repeat(25000); // ~50KB gets truncated to include only As

    await client.embeddings.create({
      input: largeContent,
      model: 'text-embedding-3-small',
      dimensions: 1536,
      encoding_format: 'float',
    });

    // Test 2: Given an array of embeddings only the last embedding should be kept
    // The last embedding should be truncated to fit within the 20KB limit
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000) + 'D'.repeat(25000); // ~50KB (will be truncated, only C's remain)

    await client.embeddings.create({
      input: [largeContent1, largeContent2, largeContent3],
      model: 'text-embedding-3-small',
      dimensions: 1536,
      encoding_format: 'float',
    });

    // Test 3: Given an array of embeddings only the last embedding should be kept
    // The last embedding is small, so it should be kept intact
    const smallContent = 'This is a small input that fits within the limit';
    await client.embeddings.create({
      input: [largeContent1, largeContent2, smallContent],
      model: 'text-embedding-3-small',
      dimensions: 1536,
      encoding_format: 'float',
    });
  });
}

run();
