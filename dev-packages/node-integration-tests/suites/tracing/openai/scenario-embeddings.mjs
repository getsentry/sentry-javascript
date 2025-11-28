import { instrumentOpenAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockOpenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.embeddings = {
      create: async params => {
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          error.status = 404;
          error.headers = { 'x-request-id': 'mock-request-123' };
          throw error;
        }

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

    // First test: embeddings API
    await client.embeddings.create({
      input: 'Embedding test!',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      encoding_format: 'float',
    });

    // Second test: embeddings API error model
    try {
      await client.embeddings.create({
        input: 'Error embedding test!',
        model: 'error-model',
      });
    } catch {
      // Error is expected and handled
    }
  });
}

run();
