class MockLanguageModelV1 {
  constructor(config) {
    this.doGenerate = config.doGenerate;
  }
}

export const mockModelBasic = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 20 },
    text: 'Mock response from model',
  }),
});

// Mock implementation of generateText that uses the mock models
export async function mockGenerateText(options) {
  const model = options.model;

  return await window.Sentry.startSpan(
    {
      name: 'ai.generateText',
      attributes: {
        'ai.model.id': 'gpt-4-turbo',
        'ai.model.provider': 'openai',
      },
    },
    async () => {
      const result = await model.doGenerate();

      return await window.Sentry.startSpan(
        {
          name: 'ai.generateText.doGenerate',
          attributes: {
            'ai.model.id': 'gpt-4-turbo',
            'ai.model.provider': 'openai',
            'ai.prompt': options.prompt,
            'ai.response.text': result.text,
            'ai.usage.promptTokens': result.usage.promptTokens,
            'ai.usage.completionTokens': result.usage.completionTokens,
          },
        },
        async () => {
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 10));

          return {
            text: result.text,
            usage: result.usage,
          };
        },
      );
    },
  );
}
