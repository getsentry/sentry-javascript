import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import { z } from 'zod';

async function run() {
  Sentry.setTag('test-tag', 'test-value');

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'tool-calls',
          usage: { promptTokens: 15, completionTokens: 25 },
          text: 'Tool call completed!',
          toolCalls: [
            {
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              args: '{ "location": "San Francisco" }',
            },
          ],
        }),
      }),
      tools: {
        getWeather: {
          parameters: z.object({ location: z.string() }),
          execute: async () => {
            throw new Error('Error in tool');
          },
        },
      },
      prompt: 'What is the weather in San Francisco?',
    });
  });
}

run();
