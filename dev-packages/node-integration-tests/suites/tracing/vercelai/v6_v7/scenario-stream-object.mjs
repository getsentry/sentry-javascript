import * as Sentry from '@sentry/node';
import { streamObject } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const result = streamObject({
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: '{ "name": "John Doe",' },
              { type: 'text-delta', id: '0', delta: ' "age": 30 }' },
              { type: 'text-end', id: '0' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: { total: 15, noCache: 15, cached: 0 },
                  outputTokens: { total: 25, noCache: 25, cached: 0 },
                  totalTokens: { total: 40, noCache: 40, cached: 0 },
                },
              },
            ],
          }),
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
}

run();
