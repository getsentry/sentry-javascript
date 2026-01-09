import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cached: 0 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 30, cached: 0 },
          },
          content: [{ type: 'text', text: 'First span here!' }],
          warnings: [],
        }),
      }),
      prompt: 'Where is the first span?',
    });

    // This span should have input and output prompts attached because telemetry is explicitly enabled.
    await generateText({
      experimental_telemetry: { isEnabled: true },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cached: 0 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 30, cached: 0 },
          },
          content: [{ type: 'text', text: 'Second span here!' }],
          warnings: [],
        }),
      }),
      prompt: 'Where is the second span?',
    });

    // This span should include tool calls and tool results
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
          execute: async ({ location }) => `Weather in ${location}: Sunny, 72°F`,
        }),
      },
      prompt: 'What is the weather in San Francisco?',
    });

    // This span should not be captured because we've disabled telemetry
    await generateText({
      experimental_telemetry: { isEnabled: false },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cached: 0 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 30, cached: 0 },
          },
          content: [{ type: 'text', text: 'Third span here!' }],
          warnings: [],
        }),
      }),
      prompt: 'Where is the third span?',
    });
  });
}

run();
