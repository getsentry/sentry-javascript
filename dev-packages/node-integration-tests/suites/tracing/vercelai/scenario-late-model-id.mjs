import * as Sentry from '@sentry/node';
import { generateText } from 'ai';

// Custom mock model that doesn't set modelId initially (simulates late model ID setting)
// This tests that the op is correctly set even when model ID is not available at span start.
// The span name update (e.g., 'generate_text gpt-4') is skipped when model ID is missing.t
class LateModelIdMock {
  specificationVersion = 'v1';
  provider = 'late-model-provider';
  // modelId is intentionally undefined initially to simulate late setting
  modelId = undefined;
  defaultObjectGenerationMode = 'json';

  async doGenerate() {
    // Model ID is only "available" during generation, not at span start
    this.modelId = 'late-mock-model-id';

    return {
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop',
      usage: { promptTokens: 5, completionTokens: 10 },
      text: 'Response from late model!',
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new LateModelIdMock(),
      prompt: 'Test prompt for late model ID',
    });
  });
}

run();
