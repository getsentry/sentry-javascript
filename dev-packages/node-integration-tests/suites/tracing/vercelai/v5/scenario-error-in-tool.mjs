import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV2({
        doGenerate: async () => ({
          finishReason: 'tool-calls',
          usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              input: JSON.stringify({ location: 'San Francisco' }),
            },
          ],
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
