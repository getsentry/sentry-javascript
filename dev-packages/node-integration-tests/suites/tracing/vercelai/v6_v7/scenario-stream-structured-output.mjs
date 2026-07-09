import * as Sentry from '@sentry/node';
import { Output, streamText } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

// `streamObject` is deprecated in `ai` v7 (it publishes no telemetry channel events); structured
// output now flows through the `streamText` primitive with an `experimental_output`, which does. So a
// streamed structured-output call must still produce the usual streamText/doStream spans, with the
// streamed JSON captured as the output.
async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const result = streamText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      experimental_output: Output.object({
        schema: z.object({ city: z.string(), weather: z.string() }),
      }),
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: '{"city":"San Francisco",' },
              { type: 'text-delta', id: '0', delta: '"weather":"sunny"}' },
              { type: 'text-end', id: '0' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: { total: 12, noCache: 12, cached: 0 },
                  outputTokens: { total: 18, noCache: 18, cached: 0 },
                  totalTokens: { total: 30, noCache: 30, cached: 0 },
                },
              },
            ],
          }),
        }),
      }),
      prompt: 'What is the weather in San Francisco?',
    });

    for await (const _part of result.fullStream) {
      void _part;
    }
  });
}

run();
