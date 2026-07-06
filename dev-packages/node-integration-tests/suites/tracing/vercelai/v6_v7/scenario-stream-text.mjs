import * as Sentry from '@sentry/node';
import { streamText } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const result = streamText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'Stream ' },
              { type: 'text-delta', id: '0', delta: 'response!' },
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
      }),
      prompt: 'Stream me a response',
    });

    // streamText returns synchronously; drive the lazy stream to completion so
    // the spans actually finish.
    for await (const _part of result.fullStream) {
      void _part;
    }
  });
}

run();
