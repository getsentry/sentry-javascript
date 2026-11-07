import * as Sentry from '@sentry/node';
import { streamObject } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV1 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const result = streamObject({
      model: new MockLanguageModelV1({
        defaultObjectGenerationMode: 'json',
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'response-metadata', id: 'resp-1', modelId: 'mock-model-id' },
            { type: 'text-delta', textDelta: '{ "name": "John Doe",' },
            { type: 'text-delta', textDelta: ' "age": 30 }' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 15, completionTokens: 25 },
            },
          ]),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      }),
      schema: z.object({ name: z.string(), age: z.number() }),
      prompt: 'Generate a person object',
    });

    // streamObject returns synchronously; drive the lazy stream to completion so the spans finish.
    for await (const _part of result.partialObjectStream) {
      void _part;
    }
  });

  await Sentry.flush(2000);
}

run();
