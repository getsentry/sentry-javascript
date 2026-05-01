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
        text: () => 'Response',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        candidates: [
          {
            content: { parts: [{ text: 'Response' }], role: 'model' },
            finishReason: 'STOP',
          },
        ],
      },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockGoogleGenerativeAI({ apiKey: 'mock-api-key' });
    const client = instrumentGoogleGenAIClient(mockClient, { enableTruncation: false, recordInputs: true });

    // Long content that would normally be truncated
    const longContent = 'A'.repeat(50_000);
    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        { role: 'user', parts: [{ text: longContent }] },
        { role: 'model', parts: [{ text: 'Some reply' }] },
        { role: 'user', parts: [{ text: 'Follow-up question' }] },
      ],
    });
  });
}

run();
