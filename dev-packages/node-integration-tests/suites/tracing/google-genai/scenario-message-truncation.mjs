import { instrumentGoogleGenAIClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockGoogleGenerativeAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.models = {
      generateContent: this._generateContent.bind(this),
    };
  }

  async _generateContent() {
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      response: {
        text: () => 'Response to truncated messages',
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 15,
          totalTokenCount: 25,
        },
        candidates: [
          {
            content: {
              parts: [{ text: 'Response to truncated messages' }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
      },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockGoogleGenerativeAI({
      apiKey: 'mock-api-key',
    });

    const client = instrumentGoogleGenAIClient(mockClient);

    // Create 3 large messages where:
    // - First 2 messages are very large (will be dropped)
    // - Last message is large but will be truncated to fit within the 20KB limit
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000); // ~25KB (will be truncated)

    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 100,
      },
      contents: [
        { role: 'user', parts: [{ text: largeContent1 }] },
        { role: 'model', parts: [{ text: largeContent2 }] },
        { role: 'user', parts: [{ text: largeContent3 }] },
      ],
    });
  });
}

run();
