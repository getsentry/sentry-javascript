import * as Sentry from '@sentry/node';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: 'First span here!',
        }),
      }),
      prompt: 'Where is the first span?',
    });

    // This span should have input and output prompts attached because telemetry is explicitly enabled.
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: 'Second span here!',
        }),
      }),
      prompt: 'Where is the second span?',
    });

    // This span should include tool calls and tool results
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
          execute: async args => {
            return `Weather in ${args.location}: Sunny, 72°F`;
          },
        },
      },
      prompt: 'What is the weather in San Francisco?',
    });

    // This span should not be captured because we've disabled telemetry
    await generateText({
      experimental_telemetry: { isEnabled: false },
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
          text: 'Third span here!',
        }),
      }),
      prompt: 'Where is the third span?',
    });
  });
}

run();
