import * as Sentry from '@sentry/node';
import { streamText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const { textStream } = streamText({
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cached: 0 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 30, cached: 0 },
          },
          content: [{ type: 'text', text: 'Streamed response!' }],
          warnings: [],
        }),
      }),
      prompt: 'Stream me a response',
    });

    const chunks = [];
    for await (const chunk of textStream) {
      chunks.push(chunk);
    }
  });
}

run();
