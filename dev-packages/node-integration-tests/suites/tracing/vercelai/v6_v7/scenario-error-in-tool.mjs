import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage: {
            inputTokens: { total: 15, noCache: 15, cached: 0 },
            outputTokens: { total: 25, noCache: 25, cached: 0 },
            totalTokens: { total: 40, noCache: 40, cached: 0 },
          },
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              input: JSON.stringify({ location: 'San Francisco' }),
            },
          ],
          warnings: [],
        }),
      }),
      tools: {
        getWeather: tool({
          inputSchema: z.object({ location: z.string() }),
          execute: async () => {
            throw new Error('Error in tool');
          },
        }),
      },
      prompt: 'What is the weather in San Francisco?',
    });
  });
}

run();
