import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const model = () =>
  new MockLanguageModelV3({
    doGenerate: async () => ({
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cached: 0 },
        outputTokens: { total: 20, noCache: 20, cached: 0 },
        totalTokens: { total: 30, noCache: 30, cached: 0 },
      },
      content: [{ type: 'text', text: 'ok' }],
      warnings: [],
    }),
  });

const brief = { role: 'system', content: 'Be brief.' };
const kind = { role: 'system', content: 'Be kind.' };

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // v6 reads `system`, v7 reads `instructions`.
    await generateText({
      experimental_telemetry: { isEnabled: true, recordInputs: true },
      system: brief,
      instructions: brief,
      model: model(),
      prompt: 'hi',
    });
    await generateText({
      experimental_telemetry: { isEnabled: true, recordInputs: true },
      system: [brief, kind],
      instructions: [brief, kind],
      model: model(),
      prompt: 'hi',
    });
  });
}

run();
