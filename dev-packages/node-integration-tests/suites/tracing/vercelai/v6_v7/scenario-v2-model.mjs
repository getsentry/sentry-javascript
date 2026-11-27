import * as Sentry from '@sentry/node';
import { generateText, streamText } from 'ai';
import { simulateReadableStream } from 'ai/test';

const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };

const doGenerate = async () => ({
  content: [{ type: 'text', text: 'Generated from v2' }],
  finishReason: 'stop',
  usage,
  warnings: [],
});
const doStream = async () => ({
  stream: simulateReadableStream({
    chunks: [
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'Streamed from v2' },
      { type: 'text-end', id: '1' },
      { type: 'finish', finishReason: 'stop', usage },
    ],
  }),
});
// ai 6 wraps spec-v2 models (e.g. `@ai-sdk/openai@2`) in a get-only `Proxy`.
const model = {
  specificationVersion: 'v2',
  provider: 'mock-provider',
  modelId: 'mock-model-v2',
  supportedUrls: {},
  doGenerate,
  doStream,
};

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async span => {
    await generateText({ experimental_telemetry: { isEnabled: true }, model, prompt: 'Generate' });

    const result = streamText({ experimental_telemetry: { isEnabled: true }, model, prompt: 'Stream' });
    for await (const _ of result.textStream) {
      // drain
    }

    span.setAttribute('test.model_mutated', model.doGenerate !== doGenerate || model.doStream !== doStream);
  });
}

run();
