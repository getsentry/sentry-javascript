import * as Sentry from '@sentry/node';
import { streamText } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';

function makeStreamModel(text) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: text },
          { type: 'text-end', id: '0' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 10, noCache: 10, cached: 0 },
              outputTokens: { total: 20, noCache: 20, cached: 0 },
              totalTokens: { total: 30, noCache: 30, cached: 0 },
            },
          },
        ],
      }),
    }),
  });
}

async function consume(result) {
  for await (const _part of result.fullStream) {
    void _part;
  }
}

async function run() {
  // A single model instance shared by two *concurrent* streamText calls. The shared model carries
  // only a single captured-parent slot, so naive parent tracking could attribute a model call to
  // whichever operation resolved the model last. Each `generate_content` (doStream) must land under
  // its own `invoke_agent`, and both invoke_agents under `main`.
  const sharedModel = makeStreamModel('shared!');

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Start both operations before consuming either, so both resolve the shared model first.
    const streams = [
      streamText({
        experimental_telemetry: { isEnabled: true },
        model: sharedModel,
        prompt: 'Concurrent stream A?',
      }),
      streamText({
        experimental_telemetry: { isEnabled: true },
        model: sharedModel,
        prompt: 'Concurrent stream B?',
      }),
    ];

    await Promise.all(streams.map(consume));
  });
}

run();
