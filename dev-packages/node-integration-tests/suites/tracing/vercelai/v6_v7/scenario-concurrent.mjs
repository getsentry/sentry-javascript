import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

function makeModel(text) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cached: 0 },
        outputTokens: { total: 20, noCache: 20, cached: 0 },
        totalTokens: { total: 30, noCache: 30, cached: 0 },
      },
      content: [{ type: 'text', text }],
      warnings: [],
    }),
  });
}

async function run() {
  // A single model instance shared by two *concurrent* generateText calls. This
  // is the case where naive parent tracking could attribute a model call to the
  // wrong invoke_agent span; each generate_content must land under its own
  // invoke_agent, and both invoke_agents under `main`.
  const sharedModel = makeModel('shared!');

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await Promise.all([
      generateText({
        experimental_telemetry: { isEnabled: true },
        model: sharedModel,
        prompt: 'Concurrent A?',
      }),
      generateText({
        experimental_telemetry: { isEnabled: true },
        model: sharedModel,
        prompt: 'Concurrent B?',
      }),
    ]);
  });
}

run();
