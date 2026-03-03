import { instrumentGoogleGenAIClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockGoogleGenAI {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.models = {
      generateContent: async params => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          response: {
            text: () => 'Response',
            modelVersion: params.model,
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 15,
            },
            candidates: [
              {
                content: {
                  parts: [{ text: 'Response' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
          },
        };
      },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockGoogleGenAI({ apiKey: 'mock-api-key' });
    const client = instrumentGoogleGenAIClient(mockClient);

    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      config: {
        systemInstruction: 'You are a helpful assistant',
      },
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    });
  });
}

run();
