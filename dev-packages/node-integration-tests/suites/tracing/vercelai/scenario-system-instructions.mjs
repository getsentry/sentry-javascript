import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
          text: 'Response',
        }),
      }),
      system: 'You are a helpful assistant',
      prompt: 'Hello',
    });
  });
}

run();
