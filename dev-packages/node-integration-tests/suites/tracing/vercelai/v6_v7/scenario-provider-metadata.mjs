import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      instructions: 'You are a helpful assistant.',
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 5, cached: 5 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 25, cached: 5 },
          },
          content: [{ type: 'text', text: 'Provider metadata span!' }],
          warnings: [],
          providerMetadata: {
            openai: {
              cachedPromptTokens: 5,
              reasoningTokens: 7,
              responseId: 'resp_abc123',
            },
          },
        }),
      }),
      messages: [{ role: 'user', content: 'Tell me something' }],
    });
  });
}

run();
