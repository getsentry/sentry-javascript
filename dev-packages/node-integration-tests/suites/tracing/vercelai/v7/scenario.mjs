import * as Sentry from '@sentry/node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Basic generateText — no telemetry config needed, DC subscriber auto-captures
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cached: 0 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 30, cached: 0 },
          },
          content: [{ type: 'text', text: 'First response!' }],
          warnings: [],
        }),
      }),
      prompt: 'Where is the first span?',
    });

    // generateText with tool calls
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
          description: 'Get the current weather for a location',
          inputSchema: z.object({ location: z.string() }),
          execute: async ({ location }) => `Weather in ${location}: Sunny, 72°F`,
        }),
      },
      prompt: 'What is the weather in San Francisco?',
    });

    // generateText with telemetry explicitly disabled — should NOT produce spans
    await generateText({
      telemetry: { isEnabled: false },
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cached: 0 },
            outputTokens: { total: 20, noCache: 20, cached: 0 },
            totalTokens: { total: 30, noCache: 30, cached: 0 },
          },
          content: [{ type: 'text', text: 'Should not be captured!' }],
          warnings: [],
        }),
      }),
      prompt: 'This should be silent',
    });
  });
}

run();
