import * as Sentry from '@sentry/node';
import { generateText } from 'ai';

// ai 6 has no `MockLanguageModelV2` in `ai/test` — only `MockLanguageModelV3` — so the spec-v2 models
// are hand-written. ai 6 wraps them in a Proxy (`asLanguageModelV3`) whose get trap returns a fresh
// closure forwarding to the target on every read and which has no set trap; patching `doGenerate`
// through that proxy recursed until the stack overflowed (#26905).
const v2Model = {
  specificationVersion: 'v2',
  provider: 'mock',
  modelId: 'mock-model-id',
  doGenerate: async () => ({
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    content: [{ type: 'text', text: 'First span here!' }],
    warnings: [],
  }),
};

// A second v2 model, only ever reached via `prepareStep` — the operation start never sees it, so
// its model call is only instrumented if patching through the `resolveLanguageModel` proxy works.
const v2ModelB = {
  specificationVersion: 'v2',
  provider: 'mock',
  modelId: 'mock-model-2',
  doGenerate: async () => ({
    finishReason: 'stop',
    usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 },
    content: [{ type: 'text', text: 'Second span here!' }],
    warnings: [],
  }),
};

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: v2Model,
      prompt: 'Where is the first span?',
    });

    await generateText({
      model: v2Model,
      prepareStep: () => ({ model: v2ModelB }),
      prompt: 'Where is the second span?',
    });
  });
}

run();
