import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      telemetry: { isEnabled: false },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cached: 0 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 30, cached: 0 },
          },
          content: [{ type: 'text', text: 'Should not be captured' }],
          warnings: [],
        }),
      }),
      prompt: 'This should be silent',
    });
  });
}

run();
