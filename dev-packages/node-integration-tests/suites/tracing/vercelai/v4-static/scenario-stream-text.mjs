import * as Sentry from '@sentry/node';
import { streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV1 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const result = streamText({
      experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      model: new MockLanguageModelV1({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'response-metadata', id: 'resp-1', modelId: 'mock-model-id' },
            { type: 'text-delta', textDelta: 'Stream ' },
            { type: 'text-delta', textDelta: 'response!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 10, completionTokens: 20 },
            },
          ]),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      }),
      prompt: 'Stream me a response',
    });

    // streamText returns synchronously; drive the lazy stream to completion so the spans finish.
    for await (const _part of result.textStream) {
      void _part;
    }
  });

  await Sentry.flush(2000);
}

run();
