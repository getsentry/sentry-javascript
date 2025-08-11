import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV2({
        doGenerate: async () => ({
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          content: [{ type: 'text', text: 'First span here!' }],
        }),
      }),
      prompt: 'Where is the first span?',
    });

    // This span should have input and output prompts attached because telemetry is explicitly enabled.
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV2({
        doGenerate: async () => ({
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          content: [{ type: 'text', text: 'Second span here!' }],
        }),
      }),
      prompt: 'Where is the second span?',
    });

    // This span should include tool calls and tool results
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
          execute: async ({ location }) => `Weather in ${location}: Sunny, 72°F`,
        }),
      },
      prompt: 'What is the weather in San Francisco?',
    });

    // This span should not be captured because we've disabled telemetry
    await generateText({
      experimental_telemetry: { isEnabled: false },
      model: new MockLanguageModelV2({
        doGenerate: async () => ({
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          content: [{ type: 'text', text: 'Third span here!' }],
        }),
      }),
      prompt: 'Where is the third span?',
    });
  });
}

run();
