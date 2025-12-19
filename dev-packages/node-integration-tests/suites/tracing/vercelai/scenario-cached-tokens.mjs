import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 20 },
          providerMetadata: {
            openai: {
              cachedPromptTokens: 50,
            },
          },
        }),
      }),
      prompt: 'Test prompt',
    });
  });
}

run();
